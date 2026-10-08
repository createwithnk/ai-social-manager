// Actual payment entrypoints with intercepted Supabase/provider HTTP. No server
// is started, no network permission is granted, and no real account is used.
const UID = 'a1111111-1111-4111-8111-111111111111'
const project = 'https://payment-fixture.supabase.co'
const webhookSecret = 'payment-webhook-fixture-secret-only'
type Handler = (req: Request) => Promise<Response>
function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message)
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected payment handler result')
}

Deno.test('payment request handlers enforce gates, immutable prices, verified events and uncertain outcomes', async t => {
  const values: Record<string, string> = {
    SUPABASE_URL: project,
    SUPABASE_ANON_KEY: 'public-fixture-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-fixture-key',
    BILLING_ENABLED: 'true',
    ALLOWED_ORIGINS: 'https://app.example',
    APP_URL: 'https://app.example',
    BILLING_PLANS_JSON: JSON.stringify([{id:'fixture',label:'Test fixture only',amount:10000,credits:2}]),
    RAZORPAY_KEY_ID: 'rzp_test_Fixture123',
    RAZORPAY_KEY_SECRET: 'payment-provider-fixture-secret',
    RAZORPAY_ACCOUNT_ID: 'acc_fixture',
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  }
  const names = [...Object.keys(values),'SUPABASE_PUBLISHABLE_KEYS','SUPABASE_SECRET_KEYS']
  const previous = new Map(names.map(name => [name,Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  const serveDescriptor = Object.getOwnPropertyDescriptor(Deno,'serve')!
  const handlers: Handler[] = []
  const calls: {path:string;body:Record<string,unknown>}[] = []
  const orders: Record<string,unknown>[] = []
  const patches: Record<string,unknown>[] = []
  let active = true, databaseGate = true, quota = true, providerTimeout = false, databaseAcceptsPayment = true
  let providerCalls = 0
  try {
    for (const [name,value] of Object.entries(values)) Deno.env.set(name,value)
    Deno.env.delete('SUPABASE_PUBLISHABLE_KEYS'); Deno.env.delete('SUPABASE_SECRET_KEYS')
    Object.defineProperty(Deno,'serve',{configurable:serveDescriptor.configurable,enumerable:serveDescriptor.enumerable,writable:true,value:(handler: Handler) => handlers.push(handler)})
    await import('../supabase/functions/payment-checkout/index.ts')
    await import('../supabase/functions/payment-webhook/index.ts')
    Object.defineProperty(Deno,'serve',serveDescriptor)
    equal(handlers.length,2)
    const [checkout,webhook] = handlers
    globalThis.fetch = async (input,options) => {
      const req = new Request(input,options), url = new URL(req.url)
      let body: Record<string,unknown> = {}
      if (req.method === 'POST' || req.method === 'PATCH') {
        try { body = await req.json() } catch { /* Auth GET/empty requests have no JSON. */ }
      }
      calls.push({path:url.pathname,body})
      if (url.origin === project) {
        if (url.pathname === '/auth/v1/user') return Response.json({id:UID,aud:'authenticated',role:'authenticated'})
        if (url.pathname === '/rest/v1/rpc/has_active_session') return Response.json(active)
        if (url.pathname === '/rest/v1/rpc/launch_status') return Response.json({billing:databaseGate,publishing:false})
        if (url.pathname === '/rest/v1/rpc/service_action_quota') return Response.json(quota)
        if (url.pathname === '/rest/v1/payment_orders' && req.method === 'POST') { orders.push(body); return Response.json([],{status:201}) }
        if (url.pathname === '/rest/v1/payment_orders' && req.method === 'PATCH') { patches.push(body); return Response.json([]) }
        if (url.pathname === '/rest/v1/rpc/service_record_payment') return Response.json(databaseAcceptsPayment)
        if (url.pathname === '/rest/v1/rpc/service_record_refund') return Response.json(true)
      }
      if (url.origin === 'https://api.razorpay.com' && url.pathname === '/v1/payment_links/') {
        providerCalls++
        if (providerTimeout) throw new Error('Simulated provider timeout')
        equal(body.amount,10000); equal(body.currency,'INR'); equal(body.accept_partial,false)
        equal(body.notify,{sms:false,email:false})
        equal(body.callback_url,'https://app.example/?screen=settings&payment=returned')
        return Response.json({id:'plink_Fixture123',short_url:'https://rzp.io/i/fixture',amount:body.amount,currency:body.currency,reference_id:body.reference_id,accept_partial:false})
      }
      throw new Error('Unexpected outbound request; network is never permitted')
    }
    const request = (body: Record<string,unknown>, signedIn = true, origin = 'https://app.example') =>
      new Request('https://edge.example/payment-checkout',{method:'POST',headers:{'content-type':'application/json',origin,...(signedIn?{authorization:'Bearer fixture-user-token'}:{})},body:JSON.stringify(body)})
    async function event(body: unknown, signatureValid = true, eventId = 'evt_fixture') {
      const raw = JSON.stringify(body), bytes = new TextEncoder().encode(raw)
      const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(webhookSecret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
      const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)),byte=>byte.toString(16).padStart(2,'0')).join('')
      return new Request('https://edge.example/payment-webhook',{method:'POST',headers:{'x-razorpay-signature':signatureValid?signature:'0'.repeat(64),'x-razorpay-event-id':eventId,'content-type':'application/json'},body:raw})
    }
    await t.step('closed environment gate makes no HTTP call',async()=>{
      Deno.env.set('BILLING_ENABLED','false'); const before = calls.length
      equal((await checkout(request({action:'plans'}))).status,423); equal(calls.length,before)
      equal((await webhook(await event({event:'payment_link.paid'}))).status,423); equal(calls.length,before)
      Deno.env.set('BILLING_ENABLED','true')
    })
    await t.step('closed database gate cannot create a checkout',async()=>{
      databaseGate = false; equal((await checkout(request({action:'checkout',planId:'fixture'}))).status,423)
      equal(orders.length,0); equal(providerCalls,0); databaseGate = true
    })
    await t.step('unlisted origin is rejected before backend calls',async()=>{
      const before = calls.length
      equal((await checkout(request({action:'plans'},true,'https://evil.example'))).status,403); equal(calls.length,before)
    })
    await t.step('missing login and revoked session cannot create an order',async()=>{
      equal((await checkout(request({action:'plans'},false))).status,401)
      active = false; equal((await checkout(request({action:'plans'}))).status,401); active = true
      equal(orders.length,0); equal(providerCalls,0)
    })
    await t.step('plans expose no provider secret',async()=>{
      const response = await checkout(request({action:'plans'})); equal(response.status,200)
      equal(await response.json(),{plans:[{id:'fixture',label:'Test fixture only',amount:10000,credits:2,currency:'INR'}]})
    })
    await t.step('unknown plan and exhausted checkout quota stop before provider',async()=>{
      equal((await checkout(request({action:'checkout',planId:'unknown'}))).status,400)
      quota = false; equal((await checkout(request({action:'checkout',planId:'fixture'}))).status,429); quota = true
      equal(orders.length,0); equal(providerCalls,0)
    })
    await t.step('client cannot override price, credits, currency or owner',async()=>{
      const response = await checkout(request({action:'checkout',planId:'fixture',amount:1,credits:999999,currency:'USD',user_id:'other-user'}))
      equal(response.status,200); equal(providerCalls,1)
      equal(orders[0].amount,10000); equal(orders[0].credits,2); equal(orders[0].currency,'INR'); equal(orders[0].user_id,UID)
      const returned = await response.json()
      equal(returned.orderId,orders[0].id); equal(returned.url,'https://rzp.io/i/fixture')
      equal(patches[0],{provider_link_id:'plink_Fixture123',status:'pending'})
    })
    await t.step('provider timeout stays uncertain and is not retried',async()=>{
      providerTimeout = true; const before = providerCalls
      equal((await checkout(request({action:'checkout',planId:'fixture'}))).status,502)
      equal(providerCalls,before+1); equal(patches.at(-1),{status:'uncertain'}); providerTimeout = false
    })
    const paid = {account_id:'acc_fixture',event:'payment_link.paid',payload:{
      payment_link:{entity:{id:'plink_Fixture123',reference_id:orders[0].id,status:'paid',accept_partial:false,currency:'INR',amount:10000,amount_paid:10000}},
      payment:{entity:{id:'pay_Fixture123',captured:true,status:'captured',amount:10000,currency:'INR',amount_refunded:0}},
    }}
    const recordedPayments = () => calls.filter(call=>call.path.endsWith('/service_record_payment'))
    await t.step('forged signature cannot reach credit accounting',async()=>{
      equal((await webhook(await event(paid,false))).status,401); equal(recordedPayments().length,0)
    })
    await t.step('wrong merchant and uncaptured payment cannot reach accounting',async()=>{
      equal((await webhook(await event({...paid,account_id:'acc_other'}))).status,400)
      paid.payload.payment.entity.captured = false
      equal((await webhook(await event(paid))).status,400); paid.payload.payment.entity.captured = true
      equal(recordedPayments().length,0)
    })
    await t.step('valid captured event passes immutable identity/amount to server RPC',async()=>{
      equal((await webhook(await event(paid))).status,200)
      equal(recordedPayments()[0].body,{event_key:'evt_fixture',link_id:'plink_Fixture123',reference:orders[0].id,paid_amount:10000,paid_currency:'INR',payment_id:'pay_Fixture123'})
    })
    await t.step('database verification failure is surfaced instead of granting credit',async()=>{
      databaseAcceptsPayment = false
      equal((await webhook(await event(paid))).status,409); databaseAcceptsPayment = true
    })
    await t.step('irrelevant events are acknowledged without accounting',async()=>{
      const before = recordedPayments().length
      equal((await webhook(await event({event:'payment.authorized'}))).status,200); equal(recordedPayments().length,before)
    })
    await t.step('verified processed refund reaches only refund accounting',async()=>{
      const refund = {account_id:'acc_fixture',event:'refund.processed',payload:{refund:{entity:{id:'rfnd_Fixture123',payment_id:'pay_Fixture123',status:'processed',amount:5000,currency:'INR'}}}}
      equal((await webhook(await event(refund,true,'evt_refund_fixture'))).status,200)
      equal(calls.find(call=>call.path.endsWith('/service_record_refund'))?.body,{event_key:'evt_refund_fixture',refund_id:'rfnd_Fixture123',payment_id:'pay_Fixture123',refund_amount:5000,refund_currency:'INR'})
      assert(calls.every(call=>!call.path.endsWith('/refunds')),'No refund initiation is allowed')
    })
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(Deno,'serve',serveDescriptor)
    for (const [name,value] of previous) { if (value === undefined) Deno.env.delete(name); else Deno.env.set(name,value) }
  }
})
