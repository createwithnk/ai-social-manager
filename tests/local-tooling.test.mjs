import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { isolatedPgEnvironment } from '../scripts/native-pg-environment.mjs'

test('native process environment cannot inherit production connections, services, credentials or preload hooks', () => {
  const directory = path.resolve('test-socket')
  const env = isolatedPgEnvironment({ PATH: '/bin', LANG: 'C', PGHOST: 'production.example', PGSERVICE: 'production', PGSERVICEFILE: '/private/service', PGPASSFILE: '/private/password', PGPASSWORD: 'private-password', DATABASE_URL: 'postgres://production.example/postgres', SUPABASE_SERVICE_ROLE_KEY: 'private-key', GEMINI_API_KEY: 'private-key', GITHUB_TOKEN: 'private-token', NODE_OPTIONS: '--require /unexpected' }, directory)
  assert.equal(env.PGHOST, directory)
  assert.equal(env.PGPORT, '5432')
  assert.equal(env.PGDATABASE, 'postgres')
  assert.equal(env.PGPASSWORD, '')
  assert.equal(env.PGPASSFILE, '/dev/null')
  assert.equal(env.PATH, '/bin')
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'GITHUB_TOKEN', 'NODE_OPTIONS']) assert.equal(Object.hasOwn(env, key), false, key)
})

test('native tools reject a remote URL in place of their local socket directory', () => {
  assert.throws(() => isolatedPgEnvironment({}, 'postgres://production.example/postgres'), /absolute local socket/)
})

test('native acceptance refuses absent or relative tools without a hosted fallback', () => {
  for (const bin of ['', './postgres']) {
    const result = spawnSync(process.execPath, ['scripts/verify-native-beta.mjs'], {
      env: { PATH: process.env.PATH, AASIFLOW_TEST_PG_BIN: bin, PGHOST: 'must-not-connect.example', DATABASE_URL: 'postgres://must-not-connect.example/postgres' },
      encoding: 'utf8', timeout: 10000,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /absolute PostgreSQL 17 bin directory/)
    assert.doesNotMatch(result.stdout, /Synthetic native evidence/)
  }
})

test('local Deno override cannot bypass the pinned runtime version', () => {
  for (const binary of ['./deno', process.execPath]) {
    const result = spawnSync(process.execPath, ['scripts/run-deno.mjs', 'test'], {
      env: { PATH: process.env.PATH, AASIFLOW_TEST_DENO_BIN: binary }, encoding: 'utf8', timeout: 15000,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /absolute path|exactly Deno 2\.9\.6/)
    assert.doesNotMatch(result.stdout, /running \d+ tests/)
  }
})
