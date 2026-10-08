import { env, gate, json, rpc, serviceClient } from '../_shared/runtime.ts'
import { readBody, RequestError, verifyWebhook } from '../_shared/security.ts'
import { paidEvent, refundedEvent } from '../_shared/payments.ts'

// Gateway JWT verification is off only because the body is authenticated by a
// raw-byte provider HMAC. A browser redirect can never grant paid credits.
Deno.serve(async req => {
  if (req.method !== 'POST') return json(405,{error:'Use POST.'})
  try {
    const admin = serviceClient(); await gate(admin,'billing')
    const raw = await readBody(req,65536)
    if (!await verifyWebhook(raw,req.headers.get('x-razorpay-signature') ?? '',env('RAZORPAY_WEBHOOK_SECRET'))) return json(401,{error:'Invalid webhook signature.'})
    const eventId = req.headers.get('x-razorpay-event-id') ?? ''
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(eventId)) throw new RequestError(400,'Missing event identity.')
    let body:unknown
    try { body = JSON.parse(new TextDecoder().decode(raw)) } catch { throw new RequestError(400,'Invalid event JSON.') }
    const payment = paidEvent(body,env('RAZORPAY_ACCOUNT_ID'))
    const refund=refundedEvent(body,env('RAZORPAY_ACCOUNT_ID'))
    if (!payment && !refund) return json(200,{ignored:true})
    const recorded = await rpc<boolean>(admin,payment ? 'service_record_payment' : 'service_record_refund',{event_key:eventId,...(payment ?? refund)})
    if (!recorded) throw new RequestError(409,'Order verification failed. Operator review required.')
    return json(200,{received:true})
  } catch (error) { return json(error instanceof RequestError ? error.status : 500,{error:error instanceof RequestError ? error.message : 'Webhook could not be processed.'}) }
})
