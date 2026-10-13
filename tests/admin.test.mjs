import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

for (const scenario of ['denied', 'malformed', 'allowed', 'operations', 'malformed_operations']) test(`owner monitoring handles ${scenario} without disclosing errors`, async () => {
  const states = []; let cursor = 0; let effect
  const jsx = (type, props) => ({ type, props })
  const data = { users: 2, drafts: 4, approved: 1, aiCallsToday: scenario === 'malformed' ? -1 : 6, publishingEnabled: false, billingEnabled: false, observedAt: '2026-10-13T10:00:00Z' }
  if(scenario.includes('operations')) data.operations={attempts:2,pending:1,errors:0,missingUsage:0,inputTokens:100,outputTokens:200,estimatedUsd:0.0005,committedUsd:0.04,carryoverUsd:0,clientErrors:1,aiEnabled:false,uploadsEnabled:false,dailyCallLimit:5,dailyBudgetUsd:scenario==='malformed_operations'?-1:0.1}
  const client = { rpc: name => { assert.equal(name, 'owner_monitoring'); return { abortSignal: async () => ({ data, error: scenario === 'denied' ? { message: 'secret-detail' } : null }) } } }
  const { default: Dashboard } = loadModule('../src/AdminDashboard.tsx', {
    react: { useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value }] }, useEffect: fn => { effect = fn } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, './lib/supabase': { supabase: client }, './lib/locale': { useLocale: () => ({ t: text => text, locale: 'en' }) },
  }, '', { AbortController, window: { setTimeout, clearTimeout } })
  Dashboard(); const cleanup = effect()
  await new Promise(resolve => setImmediate(resolve)); cursor = 0
  const result = JSON.stringify(Dashboard())
  assert.equal(result.includes('secret-detail'), false)
  assert.equal(result.includes('Monitoring unavailable'), !['allowed','operations'].includes(scenario))
  assert.equal(result.includes('Security alerts'), ['allowed','operations'].includes(scenario))
  if(scenario==='operations'){assert.ok(result.includes('Estimated AI cost (USD)'));assert.ok(result.includes('Unknown usage retains'));assert.ok(result.includes('AI is paused.'))}
  cleanup()
})
