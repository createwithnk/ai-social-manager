import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyInquiry, createRoutingPreview, normalizeOwnerNumber } from '../src/features/whatsapp-lead-agent/service.ts'

test('classifies purchase and booking intent as a hot lead', () => {
  assert.equal(classifyInquiry('How much does a booking cost?').category, 'hot-lead')
  assert.equal(classifyInquiry('أريد حجز موعد غدا').category, 'hot-lead')
})
test('classifies common promotional spam before sales intent', () => {
  assert.equal(classifyInquiry('Free money crypto giveaway, click here').category, 'spam')
  assert.equal(classifyInquiry('اربح مجانا اضغط هنا').category, 'spam')
})
test('keeps routine questions in FAQ and safely handles empty input', () => {
  assert.equal(classifyInquiry('What are your opening hours?').category, 'faq')
  assert.equal(classifyInquiry('   ').category, 'faq')
})
test('validates international owner numbers and rejects malformed values', () => {
  assert.equal(normalizeOwnerNumber(' +1 (415) 555-0123 '), '+14155550123')
  assert.equal(normalizeOwnerNumber('12345'), null)
  assert.equal(normalizeOwnerNumber('+012345678'), null)
})
test('creates a preview only for a hot lead and never sends a message', () => {
  const inquiry = { id:'1', sender:'Customer', message:'Please book an appointment', source:'dm', ...classifyInquiry('Please book an appointment') }
  const preview = createRoutingPreview(inquiry, '+14155550123')
  assert.equal(preview?.destination, '+14155550123')
  assert.equal(preview?.sendsMessage, false)
  assert.match(preview?.message ?? '', /no message has been sent/i)
  assert.equal(createRoutingPreview({ ...inquiry, category:'faq' }, '+14155550123'), null)
  assert.equal(createRoutingPreview(inquiry, 'not-a-number'), null)
})
