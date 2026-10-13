import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
function files(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
}
test('frontend source and built assets contain no Gemini keys or server secret access', () => {
  for (const file of [...files(path.join(root, 'src')), ...files(path.join(root, 'dist'))]) {
    if (!/\.(tsx?|jsx?|html|css|map)$/.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    // Report only file names and booleans; assertions must never print matched secrets.
    assert.equal(/AIza[\w-]{35}/.test(text), false, `Provider key detected in ${path.relative(root, file)}`)
    assert.equal(/VITE_\w*(?:GEMINI|GOOGLE_API|SERVICE_ROLE)|sb_secret_[A-Za-z0-9_-]{20,}/.test(text), false, `Server secret access in ${path.relative(root, file)}`)
    assert.equal(/generativelanguage\.googleapis\.com/.test(text), false, `Direct provider request in ${path.relative(root, file)}`)
  }
})
test('Edge Function has no logging calls and local provider secrets cannot enter Vite', () => {
  for (const file of files(path.join(root, 'supabase/functions'))) {
    if (!file.endsWith('.ts')) continue
    assert.equal(/console\s*\.|\blogger\s*\./.test(fs.readFileSync(file, 'utf8')), false, `Logging call found in ${path.relative(root, file)}`)
  }
  for (const name of fs.readdirSync(root).filter((name) => /^\.env(?:\.|$)/.test(name))) {
    const text = fs.readFileSync(path.join(root, name), 'utf8')
    assert.equal(/^\s*(?:export\s+)?VITE_\w*(?:GEMINI|GOOGLE_API|SERVICE_ROLE)\w*\s*=/mi.test(text), false, 'Server secret environment variable is exposed to Vite')
    assert.equal(/AIza[\w-]{35}/.test(text), false, 'A provider key was found in a frontend environment file')
    const anon = text.match(/^\s*VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\s"']+)/m)?.[1]
    if (anon?.startsWith('eyJ')) {
      let payload
      try { payload = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString()) } catch { assert.fail('Configured public key could not be checked') }
      assert.equal(payload.role === 'service_role', false, 'Frontend key has service role')
    }
  }
})
