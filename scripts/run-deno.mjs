import { spawnSync } from 'node:child_process'

// npm_execpath avoids relying on a separate npm executable in PATH on Windows.
if (!process.env.npm_execpath) throw new Error('Run this check through an npm script.')
const targets = process.argv[2] === 'check'
  ? ['check', ...['generate-content', 'social-account', 'social-callback', 'publish-worker', 'payment-checkout', 'payment-webhook'].map(name => `supabase/functions/${name}/index.ts`)]
  : ['test', '--allow-env', 'tests/security.test.ts', 'tests/payment-endpoints.test.ts']
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--cache', '.npm-cache', '--offline=false', '--fetch-timeout=30000', '--fetch-retries=1', '--yes', '--package=deno@2.9.6', '--', 'deno', ...targets], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
