// Not an endpoint. A future, separately authorized webhook must invoke these guards
// before accepting events and use durable message-id deduplication before routing.
export async function verifyWhatsAppBody(body: Uint8Array, signature: string | null, appSecret: string): Promise<boolean> {
  if (body.byteLength > 262144 || !/^sha256=[a-f0-9]{64}$/i.test(signature ?? '') || appSecret.length < 16 || appSecret.length > 256) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = Uint8Array.from(signature!.slice(7).match(/../g)!, pair => Number.parseInt(pair, 16))
  return crypto.subtle.verify('HMAC', key, bytes, body as Uint8Array<ArrayBuffer>)
}
export function webhookBelongsToBusiness(value: unknown, wabaId: string, phoneNumberId: string): boolean {
  if (!/^\d{5,40}$/.test(wabaId) || !/^\d{5,40}$/.test(phoneNumberId) || !value || typeof value !== 'object') return false
  const body = value as { object?: unknown; entry?: unknown }
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry) || body.entry.length < 1 || body.entry.length > 20) return false
  return body.entry.every(entry => entry && entry.id === wabaId && Array.isArray(entry.changes) && entry.changes.length > 0 && entry.changes.length <= 20 && entry.changes.every((change: { field?: unknown; value?: { metadata?: { phone_number_id?: unknown } } }) => change?.field === 'messages' && change.value?.metadata?.phone_number_id === phoneNumberId))
}
