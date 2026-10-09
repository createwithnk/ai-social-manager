import assert from 'node:assert/strict'
import { test } from 'node:test'
import { productionHeaders } from '../scripts/header-policy.mjs'
const directives = headers => Object.fromEntries(headers['Content-Security-Policy'].split('; ').map(directive => {const [key,...values]=directive.split(' ');return [key,values]}))

test('Production policy preserves private media and denies frames/scripts by default', () => {
  const headers = productionHeaders({supabaseUrl:'https://fixture.supabase.co'})
  const csp = directives(headers)
  assert.deepEqual(csp['script-src'],["'self'"]);assert.deepEqual(csp['frame-src'],["'none'"])
  assert.deepEqual(csp['connect-src'],["'self'",'https://fixture.supabase.co','wss://fixture.supabase.co'])
  assert(csp['media-src'].includes('blob:'));assert(csp['media-src'].includes('https://fixture.supabase.co'))
  assert.deepEqual(csp['frame-ancestors'],["'none'"]);assert.deepEqual(csp['object-src'],["'none'"])
  assert.equal(headers['X-Content-Type-Options'],'nosniff');assert.equal(headers['X-Frame-Options'],'DENY')
  assert.equal(headers['Permissions-Policy'],'microphone=(self), camera=(), geolocation=(), payment=()')
})
test('Configured widget allows only the documented Cloudflare script/frame origin', () => {
  const csp = directives(productionHeaders({turnstileSiteKey:'0x4AAAAAAA_fixture_site_key'}))
  assert.deepEqual(csp['script-src'],["'self'",'https://challenges.cloudflare.com'])
  assert.deepEqual(csp['frame-src'],['https://challenges.cloudflare.com'])
  assert.deepEqual(csp['connect-src'],["'self'"])
  assert(!csp['script-src'].includes("'unsafe-inline'"));assert(!csp['script-src'].includes("'unsafe-eval'"))
})
test('Build blocks dummy/malformed CAPTCHA keys and unsafe Supabase origins', () => {
  for (const key of ['1x00000000000000000000AA','2x00000000000000000000AB','3x00000000000000000000FF','key; script-src *']) assert.throws(() => productionHeaders({turnstileSiteKey:key}))
  for (const url of ['http://fixture.supabase.co','https://user:pass@fixture.supabase.co','https://fixture.supabase.co/path','https://fixture.supabase.co/?bad=1','https://fixture.supabase.co/#bad']) assert.throws(() => productionHeaders({supabaseUrl:url}))
})
