import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preferredLocale, translate, localizedError, formatDate, formatNumber, formatPrice } from '../src/lib/locale.ts'

test('explicit language choice wins over browser preferences; invalid stored values are ignored', () => {
  assert.equal(preferredLocale('en', ['ar-AE']), 'en')
  assert.equal(preferredLocale('ar', ['en-GB']), 'ar')
  assert.equal(preferredLocale('invalid', ['fr-FR', 'ar-SA', 'en-US']), 'ar')
  assert.equal(preferredLocale(null, ['en-GB', 'ar-AE']), 'en')
  assert.equal(preferredLocale({ language: 'ar' }, ['fr-FR']), 'en')
})

test('translation interpolates literal user text without treating markup or inherited values as content', () => {
  const idea = '<img src=x onerror=alert(1)> دبي {owner}'
  assert.equal(translate('ar', 'Schedule {idea}', { idea }), `تحديد موعد ${idea}`)
  assert.equal(translate('en', 'Schedule {idea}', { idea }), `Schedule ${idea}`)
  const values = Object.create({ idea: 'inherited value' }) as Record<string, string>
  assert.equal(translate('ar', 'Schedule {idea}', values), 'تحديد موعد {idea}')
  assert.equal(translate('ar', '__proto__'), '__proto__')
})

test('Arabic validation is useful while unknown backend errors use the safe localized fallback', () => {
  assert.equal(localizedError('ar', 'Choose a future date and time.'), 'اختر تاريخًا ووقتًا في المستقبل.')
  assert.match(localizedError('ar', 'Caption and hashtags exceed the 280 character limit.'), /280/)
  assert.match(localizedError('ar', 'AI attempt limit reached. Try again tomorrow (UTC). Payments remain subject to owner setup.'), /UTC/)
  assert.equal(localizedError('ar', 'Your session ended. Sign in again.'), 'انتهت جلستك. سجّل الدخول مجددًا.')
  const diagnostic = 'Unknown provider failure: private diagnostic'
  assert.equal(localizedError('ar', diagnostic), translate('ar', 'This action could not be completed.'))
  assert.equal(localizedError('en', diagnostic), diagnostic)
})

test('Arabic interface currency remains the actual INR amount without pretending to convert to AED', () => {
  for (const locale of ['en', 'ar'] as const) {
    const price = formatPrice(locale, 12550)
    assert.match(price, /INR/)
    assert.doesNotMatch(price, /AED|USD/)
    assert.match(price, /125[.,]50/)
  }
  assert.notEqual(formatNumber('en', 12550), '125.50')
})

test('date display uses the device timezone and Gregorian dates; invalid dates are localized', () => {
  const previous = process.env.TZ
  try {
    process.env.TZ = 'Asia/Dubai'
    assert.match(formatDate('en', '2099-01-01T20:00:00Z', false), /2 Jan 2099/)
    assert.match(formatDate('ar', '2099-01-01T20:00:00Z', false), /2099/)
    assert.equal(formatDate('ar', 'not-a-date'), 'غير متاح')
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})
