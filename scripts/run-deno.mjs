import { spawnSync } from 'node:child_process'
import { isAbsolute } from 'node:path'

// npm_execpath avoids relying on a separate npm executable in PATH on Windows.
const binary = process.env.AASIFLOW_TEST_DENO_BIN
if (!binary && !process.env.npm_execpath) throw new Error('Run this check through an npm script.')
const targets = process.argv[2] === 'check'
  ? ['check', ...['generate-content', 'social-account', 'social-callback', 'publish-worker', 'payment-checkout', 'payment-webhook'].map(name => `supabase/functions/${name}/index.ts`), 'supabase/functions/_shared/velo-whatsapp.ts']
  : ['test', '--allow-env', 'tests/security.test.ts', 'tests/payment-endpoints.test.ts', 'tests/velo-webhook.test.ts']
if (binary) {
  if (!isAbsolute(binary)) throw new Error('The local Deno test binary must be an absolute path.')
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 10000 })
  if (version.error || version.status !== 0 || !/^deno 2\.9\.6(?:\s|$)/.test(version.stdout ?? '')) throw new Error('Local Edge checks require exactly Deno 2.9.6. No version or integrity check is skipped.')
}
const result = binary
  ? spawnSync(binary, targets, { stdio: 'inherit' })
  : spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--cache', '.npm-cache', '--offline=false', '--fetch-timeout=30000', '--fetch-retries=1', '--yes', '--package=deno@2.9.6', '--', 'deno', ...targets], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
