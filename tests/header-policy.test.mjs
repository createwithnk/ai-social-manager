import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { productionHeaders } from '../scripts/header-policy.mjs'

const directives = headers => Object.fromEntries(headers['Content-Security-Policy'].split('; ').map(rule => {
  const [name, ...values] = rule.split(' ')
  return [name, values]
}))

test('release headers block third-party scripts, frames and browser payment access', () => {
  const headers = productionHeaders('https://fixture.supabase.co')
  const csp = directives(headers)
  assert.deepEqual(csp['script-src'], ["'self'"])
  assert.deepEqual(csp['frame-src'], ["'none'"])
  assert.deepEqual(csp['frame-ancestors'], ["'none'"])
  assert.deepEqual(csp['object-src'], ["'none'"])
  assert.equal(headers['Permissions-Policy'], 'microphone=(self), camera=(), geolocation=(), payment=()')
  assert.equal(headers['Referrer-Policy'], 'no-referrer')
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
})

test('release headers allow only the configured API and private media origins', () => {
  const csp = directives(productionHeaders('https://fixture.supabase.co'))
  assert.deepEqual(csp['connect-src'], ["'self'", 'https://fixture.supabase.co', 'wss://fixture.supabase.co'])
  assert.deepEqual(csp['media-src'], ["'self'", 'blob:', 'https://fixture.supabase.co'])
  assert.deepEqual(csp['font-src'], ["'self'"])
})

test('unsafe release origins are rejected instead of widening the policy', () => {
  for (const url of ['http://fixture.supabase.co', 'https://user:pass@fixture.supabase.co', 'https://fixture.supabase.co/path', 'https://fixture.supabase.co/?bad=1', 'https://fixture.supabase.co/#bad', 'not-a-url']) {
    assert.throws(() => productionHeaders(url))
  }
})

test('generated host header artifacts match the confirmed project and omit external fonts', () => {
  const target = JSON.parse(fs.readFileSync('deployment/target.json', 'utf8'))
  assert.equal(target.supabaseOrigin, `https://${target.projectRef}.supabase.co`)
  const headers = JSON.parse(fs.readFileSync('deployment/security-headers.json', 'utf8'))
  assert.deepEqual(headers, productionHeaders(target.supabaseOrigin))
  const hostFile = fs.readFileSync('public/_headers', 'utf8')
  for (const [name, value] of Object.entries(headers)) assert.ok(hostFile.includes(`  ${name}: ${value}`))
  assert.doesNotMatch(fs.readFileSync('src/styles.css', 'utf8'), /fonts\.googleapis\.com|fonts\.gstatic\.com/)
})
