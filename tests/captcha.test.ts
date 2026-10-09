import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captchaOptions, readCaptchaConfig } from '../src/lib/captcha.ts'
const dummy = '1x00000000000000000000AA'
const publicFixture = '0x4AAAAAAA_fixture_site_key'

test('Unconfigured CAPTCHA preserves existing Auth without contacting another service', () => {
  for (const value of [undefined,null,'']) {
    const config = readCaptchaConfig(value,'app.example',true)
    assert.equal(config.enabled,false);assert.equal(config.error,null)
    assert.deepEqual(captchaOptions(config),{})
  }
})
test('Bad configuration cannot silently fall back to unprotected login', () => {
  for (const value of [' ','x','<script>bad</script>',{},'a'.repeat(61)]) {
    const config = readCaptchaConfig(value,'app.example',true)
    assert.equal(config.enabled,true);assert.ok(config.error)
    assert.throws(() => captchaOptions(config,'fixture-proof'))
  }
})
test('Cloudflare dummy keys stay on exact loopback development hosts', () => {
  for (const host of ['localhost','127.0.0.1','::1','[::1]']) assert.equal(readCaptchaConfig(dummy,host).error,null)
  for (const host of ['localhost.evil.example','app.example','127.0.0.2']) assert.ok(readCaptchaConfig(dummy,host).error)
  for (const key of [dummy,'2x00000000000000000000AB','3x00000000000000000000FF']) assert.ok(readCaptchaConfig(key,'localhost',true).error)
})
test('Configured Auth requires bounded, nonempty proof and forwards only captchaToken', () => {
  const config = readCaptchaConfig(publicFixture,'app.example',true)
  assert.equal(config.error,null)
  for (const token of [undefined,'',' ','x'.repeat(2049)]) assert.throws(() => captchaOptions(config,token))
  assert.deepEqual(captchaOptions(config,' fixture-proof '),{captchaToken:'fixture-proof'})
})
