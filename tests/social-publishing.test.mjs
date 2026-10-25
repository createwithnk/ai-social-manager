import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSnapshot, canCancelStatus, isSupportedPlatform, SocialPublishingError } from '../src/features/social-publishing/service.ts'
import { connectionLabel, platformLabel, queueLabel } from '../src/features/social-publishing/labels.ts'

const sample = {
  enabled: true,
  connections: [
    { platform: 'instagram', status: 'connected', accountLabel: 'Demo business' },
    { platform: 'tiktok', status: 'not-configured' },
    { platform: 'youtube-shorts', status: 'disconnected' },
    { platform: 'snapchat', status: 'reauthorization-required' },
    { platform: 'google-business', status: 'error', message: 'Synthetic error' },
  ],
  queue: [{ id: 'post_1', platform: 'instagram', caption: 'عرض تجريبي', scheduledAt: '2027-01-01T09:00:00Z', status: 'scheduled' }],
}
test('validates all five connection states and queue entries without changing the input', () => {
  const original = JSON.stringify(sample), parsed = validateSnapshot(sample)
  assert.equal(parsed.connections.length, 5)
  assert.equal(parsed.queue[0].caption, 'عرض تجريبي')
  assert.equal(JSON.stringify(sample), original)
})
test('rejects malformed, duplicate, oversized and unknown provider data', () => {
  for (const value of [null, {}, { ...sample, enabled: 'yes' }, { ...sample, queue: Array(501).fill(sample.queue[0]) }, { ...sample, connections: [{ platform: 'other', status: 'connected' }] }, { ...sample, connections: [sample.connections[0], sample.connections[0]] }, { ...sample, queue: [{ ...sample.queue[0], id: '../private' }] }, { ...sample, queue: [{ ...sample.queue[0], scheduledAt: 'not-a-date' }] }, { ...sample, queue: [{ ...sample.queue[0], status: 'queued-secret' }] }]) assert.throws(() => validateSnapshot(value), SocialPublishingError)
})
test('queue actions only allow cancelling scheduled or failed jobs', () => {
  assert.equal(canCancelStatus('scheduled'), true); assert.equal(canCancelStatus('failed'), true)
  assert.equal(canCancelStatus('publishing'), false); assert.equal(canCancelStatus('published'), false); assert.equal(canCancelStatus('cancelled'), false)
  assert.equal(isSupportedPlatform('instagram'), true); assert.equal(isSupportedPlatform('linkedin'), false)
})
test('all visible provider and status labels exist in English and Arabic', () => {
  for (const platform of ['instagram','tiktok','youtube-shorts','snapchat','google-business']) {
    assert.ok(platformLabel('en', platform)); assert.ok(platformLabel('ar', platform))
  }
  for (const status of ['connected','disconnected','reauthorization-required','not-configured','error']) {
    assert.ok(connectionLabel('en', status)); assert.ok(connectionLabel('ar', status))
  }
  for (const status of ['scheduled','publishing','published','failed','cancelled']) {
    assert.ok(queueLabel('en', status)); assert.ok(queueLabel('ar', status))
  }
})
