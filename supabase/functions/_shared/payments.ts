import { object, providerJSON, text } from './providers.ts'
import { RequestError, secureURL, uuid } from './security.ts'
export interface Plan { id:string; label:string; amount:number; credits:number }
export function readPlans(raw:string):Plan[] {
  let plans:unknown
  try { plans = JSON.parse(raw) } catch { throw new RequestError(503,'Payment plans need owner setup.') }
  if (!Array.isArray(plans) || plans.length < 1 || plans.length > 10) throw new RequestError(503,'Payment plans need owner setup.')
  const ids = new Set<string>()
  for (const entry of plans) {
    const p = object(entry)
    if (typeof p.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(p.id) || ids.has(p.id) || typeof p.label !== 'string' || p.label.length < 1 || p.label.length > 100 || !Number.isSafeInteger(p.amount) || Number(p.amount) < 100 || Number(p.amount) > 10000000 || !Number.isSafeInteger(p.credits) || Number(p.credits) < 1 || Number(p.credits) > 100000) throw new RequestError(503,'Payment plans need owner setup.')
    ids.add(p.id)
  }
  return plans as Plan[]
}
export async function createPaymentLink(orderId:string, plan:Plan, keyId:string, keySecret:string, callback:string, fetcher:typeof fetch = fetch) {
  if (!uuid(orderId) || !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId) || keySecret.length < 16) throw new RequestError(503,'Payment account setup is pending.')
  secureURL(callback)
  const {body} = await providerJSON('https://api.razorpay.com/v1/payment_links/',{method:'POST',headers:{Authorization:`Basic ${btoa(`${keyId}:${keySecret}`)}`,'Content-Type':'application/json'},body:JSON.stringify({amount:plan.amount,currency:'INR',accept_partial:false,reference_id:orderId,description:`AasiFlowAI: ${plan.label}`,expire_by:Math.floor(Date.now()/1000)+3600,notify:{sms:false,email:false},reminder_enable:false,notes:{order_id:orderId},callback_url:callback,callback_method:'get'})},fetcher)
  const url = secureURL(text(body.short_url)); const id = text(body.id)
  if (url.hostname !== 'rzp.io' || url.port || !/^plink_[A-Za-z0-9]+$/.test(id) || body.amount !== plan.amount || body.currency !== 'INR' || body.reference_id !== orderId || body.accept_partial !== false) throw new RequestError(502,'Invalid payment link response.')
  return {id,url:url.toString()}
}
export function paidEvent(raw:unknown, merchantId:string) {
  const body = object(raw)
  if (body.event !== 'payment_link.paid') return null
  if (!merchantId || body.account_id !== merchantId) throw new RequestError(400,'Invalid merchant event.')
  const payload = object(body.payload); const link = object(object(payload.payment_link).entity); const payment = object(object(payload.payment).entity)
  if (link.status !== 'paid' || link.accept_partial !== false || link.currency !== 'INR' || !Number.isSafeInteger(link.amount) || Number(link.amount) < 1 || link.amount_paid !== link.amount || !uuid(link.reference_id) || typeof link.id !== 'string' || !/^plink_[A-Za-z0-9]+$/.test(link.id) || typeof payment.id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(payment.id) || payment.captured !== true || payment.status !== 'captured' || payment.currency !== 'INR' || payment.amount !== link.amount || Number(payment.amount_refunded ?? 0) !== 0) throw new RequestError(400,'Incomplete payment event.')
  return {link_id:link.id,reference:link.reference_id,paid_amount:link.amount,paid_currency:link.currency,payment_id:payment.id}
}
export function refundedEvent(raw:unknown,merchantId:string) {
  const body=object(raw)
  if(body.event !== 'refund.processed')return null
  if(!merchantId || body.account_id !== merchantId)throw new RequestError(400,'Invalid merchant event.')
  const refund=object(object(object(body.payload).refund).entity)
  if(refund.status !== 'processed' || typeof refund.id !== 'string' || !/^rfnd_[A-Za-z0-9]+$/.test(refund.id) || typeof refund.payment_id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(refund.payment_id) || refund.currency !== 'INR' || !Number.isSafeInteger(refund.amount) || Number(refund.amount)<1)throw new RequestError(400,'Invalid refund event.')
  return {refund_id:refund.id,payment_id:refund.payment_id,refund_amount:refund.amount,refund_currency:refund.currency}
}
