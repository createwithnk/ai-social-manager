import { appURL, authenticate, endpoint, env, gate, json, rpc, serviceClient } from '../_shared/runtime.ts'
import { readJSON, RequestError } from '../_shared/security.ts'
import { createPaymentLink, readPlans } from '../_shared/payments.ts'
import { ProviderError } from '../_shared/providers.ts'

// Prepared only. Do not add merchant credentials, enable gates or deploy a
// collector until the owner has authorized connecting the payment mode.
Deno.serve(endpoint(async req => {
  const admin = serviceClient(); await gate(admin,'billing')
  const {user} = await authenticate(req); const body = await readJSON(req)
  const plans = readPlans(env('BILLING_PLANS_JSON'))
  if (body.action === 'plans') return json(200,{plans:plans.map(plan => ({...plan,currency:'INR'}))})
  if (body.action !== 'checkout' || typeof body.planId !== 'string') throw new RequestError(400,'Choose a payment plan.')
  const plan = plans.find(p => p.id === body.planId)
  if (!plan) throw new RequestError(400,'Choose a configured payment plan.')
  const allowed = await rpc<boolean>(admin,'service_action_quota',{uid:user.id,kind:'checkout',maximum:5})
  if (!allowed) throw new RequestError(429,'Daily checkout limit reached.')
  const callback = appURL(); callback.search = '?screen=settings&payment=returned'
  const id = crypto.randomUUID()
  const {error} = await admin.from('payment_orders').insert({id,user_id:user.id,plan_id:plan.id,amount:plan.amount,currency:'INR',credits:plan.credits})
  if (error) throw new RequestError(503,'Could not prepare checkout.')
  try {
    const link = await createPaymentLink(id,plan,env('RAZORPAY_KEY_ID'),env('RAZORPAY_KEY_SECRET'),callback.toString())
    const {error:saveError} = await admin.from('payment_orders').update({provider_link_id:link.id,status:'pending'}).eq('id',id).eq('status','creating')
    if (saveError) throw new Error()
    return json(200,{orderId:id,url:link.url})
  } catch (error) {
    // Never retry the provider POST automatically after a network timeout.
    await admin.from('payment_orders').update({status:error instanceof ProviderError && error.status < 500 && error.status !== 408 ? 'failed' : 'uncertain'}).eq('id',id).eq('status','creating')
    throw new RequestError(502,'Checkout could not be completed. Ask the owner to check this order before retrying.')
  }
}))
