import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

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
