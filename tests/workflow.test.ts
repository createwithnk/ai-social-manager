import { test } from 'node:test'
import assert from 'node:assert/strict'
import { futureScheduleISO, validatePost } from '../src/lib/workflow.ts'
const base = { id: 'test', idea: 'A real idea', platform: 'Instagram' as const, tone: 'Friendly', caption: 'Caption', hashtags: [], status: 'draft' as const, createdAt: '2026-01-01T00:00:00Z' }
test('draft needs no approval or schedule', () => assert.doesNotThrow(() => validatePost(base)))
test('rejects empty caption', () => assert.throws(() => validatePost({ ...base, caption: ' ' })))
test('rejects past and invalid schedules', () => { for (const scheduledFor of ['bad', '2020-01-01T00:00:00Z']) assert.throws(() => validatePost({ ...base, status: 'scheduled', scheduledFor })) })
test('draft must clear its schedule', () => assert.throws(() => validatePost({ ...base, scheduledFor: '2099-01-01T00:00:00Z' })))
test('hashtag length counts toward platform limit', () => assert.throws(() => validatePost({ ...base, platform: 'X', caption: 'a'.repeat(278), hashtags: ['longtag'] })))
test('accepts future approved calendar entry', () => assert.doesNotThrow(() => validatePost({ ...base, status: 'scheduled', scheduledFor: '2099-01-01T00:00:00Z' })))
test('schedule conversion rejects invalid, past and exact-current timestamps', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  for (const value of ['', 'invalid', '2026-10-19T11:59:59Z', '2026-10-19T12:00:00Z']) assert.throws(() => futureScheduleISO(value, now), /future/)
  assert.equal(futureScheduleISO('2026-10-20T16:45:00+04:00', now), '2026-10-20T12:45:00.000Z')
})
