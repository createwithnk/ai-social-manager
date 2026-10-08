export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const encoder = new TextEncoder()
export async function readBody(req: Request | Response, maximum = 8192): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length')) > maximum) throw new RequestError(413, 'Request too large.')
  const reader = req.body?.getReader()
  if (!reader) throw new RequestError(400, 'Missing request.')
  const chunks: Uint8Array[] = []; let length = 0
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    length += value.length
    if (length > maximum) { await reader.cancel(); throw new RequestError(413, 'Request too large.') }
    chunks.push(value)
  }
  const result = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}
export async function readJSON(req: Request) {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RequestError(415, 'Use JSON.')
  try {
    const value = JSON.parse(new TextDecoder().decode(await readBody(req)))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(400, 'Invalid JSON.') }
}
export function uuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) }
export function secureURL(value: string, allowLocal = false) {
  const url = new URL(value)
  if (url.username || url.password || (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new RequestError(503, 'Secure server URL setup is pending.')
  return url
}
export function randomState() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2,'0')).join('')
}
export async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))), b => b.toString(16).padStart(2,'0')).join('')
}
function bytes64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)) }
function from64(value: string) { return Uint8Array.from(atob(value), ch => ch.charCodeAt(0)) }
async function encryptionKey(encoded: string) {
  let bytes: Uint8Array<ArrayBuffer>
  try { bytes = from64(encoded) } catch { throw new RequestError(503,'Token encryption setup is pending.') }
  if (bytes.length !== 32) throw new RequestError(503,'Token encryption setup is pending.')
  return crypto.subtle.importKey('raw',bytes,{ name:'AES-GCM' },false,['encrypt','decrypt'])
}
export async function encryptToken(value: string, key: string, context: string) {
  if (!value || value.length > 16000) throw new RequestError(502,'Invalid account credentials.')
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM',iv:nonce,additionalData:encoder.encode(context) },await encryptionKey(key),encoder.encode(value))
  return `v1.${bytes64(nonce)}.${bytes64(new Uint8Array(encrypted))}`
}
export async function decryptToken(value: string, key: string, context: string) {
  const [version,nonce,data,...extra] = value.split('.')
  if (version !== 'v1' || !nonce || !data || extra.length) throw new RequestError(503,'Reconnect this social account.')
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name:'AES-GCM',iv:from64(nonce),additionalData:encoder.encode(context) },await encryptionKey(key),from64(data)))
  } catch { throw new RequestError(503,'Reconnect this social account.') }
}
export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}
export async function verifyWebhook(bytes: Uint8Array, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature) || secret.length < 32) return false
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC',key,new Uint8Array(bytes)))
  const expected = Array.from(signed,b => b.toString(16).padStart(2,'0')).join('')
  return constantTimeEqual(expected,signature.toLowerCase())
}
export function sessionId(token: string) {
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
    if (!uuid(claims.session_id)) throw new Error()
    return claims.session_id as string
  } catch { throw new RequestError(401,'Sign in again.') }
}
