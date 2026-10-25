import { verifyWhatsAppBody, webhookBelongsToBusiness } from '../supabase/functions/_shared/velo-whatsapp.ts'

Deno.test('Velo webhook guard verifies exact raw bytes and rejects modified or oversized bodies', async () => {
  const secret = 'synthetic-deno-signing-secret'
  const bytes = new TextEncoder().encode('{"sample":true}')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes))
  const signature = 'sha256=' + [...signed].map(value => value.toString(16).padStart(2, '0')).join('')
  if (!await verifyWhatsAppBody(bytes, signature, secret)) throw new Error('Valid synthetic signature rejected')
  if (await verifyWhatsAppBody(new TextEncoder().encode('{}'), signature, secret)) throw new Error('Changed raw body accepted')
  if (await verifyWhatsAppBody(bytes, signature, 'another-synthetic-secret')) throw new Error('Wrong secret accepted')
  if (await verifyWhatsAppBody(new Uint8Array(262145), signature, secret)) throw new Error('Oversized body accepted')
})
Deno.test('Velo webhook guard rejects mixed-business and wrong-phone batches', () => {
  const value = { object: 'whatsapp_business_account', entry: [{ id: '123456', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '654321' } } }] }] }
  if (!webhookBelongsToBusiness(value, '123456', '654321')) throw new Error('Matching synthetic business rejected')
  if (webhookBelongsToBusiness(value, '123456', '111111')) throw new Error('Different phone accepted')
  const mixed = { ...value, entry: [...value.entry, { ...value.entry[0], id: '111111' }] }
  if (webhookBelongsToBusiness(mixed, '123456', '654321')) throw new Error('Mixed-business batch accepted')
})
