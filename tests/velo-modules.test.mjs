import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { addAssetLink, canonicalAssetLink, createAssetLink, readAssetLinks, removeAssetLink } from '../src/features/assets/links.ts'
import { canvaBulkCsv } from '../src/features/assets/bulk-csv.ts'
import { connectorIds, connectors, previewPublication, previewStillMatches } from '../src/features/publishing/connectors.ts'
import { createLeadFilter, sampleFaqs } from '../src/features/leads/filter.ts'
import { verifyWhatsAppBody, webhookBelongsToBusiness } from '../supabase/functions/_shared/velo-whatsapp.ts'

const ownerA = '11111111-1111-4111-8111-111111111111'
const ownerB = '22222222-2222-4222-8222-222222222222'
const post = { id: 'synthetic-post', idea: 'An offer for a UAE business', caption: 'Reviewed content', hashtags: ['UAE'], platform: 'Instagram', tone: 'Friendly', status: 'approved', revision: 2, createdAt: '2026-10-01T00:00:00Z' }
function memory() { const map = new Map(); return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) } }
function message(text, extra = {}) { return { id: 'sample-1', businessId: 'sample-business', conversationId: 'sample-customer', text, customerRoutingConsent: false, ...extra } }

test('asset links reject hostile origins, credentials, tokens and schemes without requesting a URL', () => {
  for (const url of ['javascript:alert(1)', 'http://drive.google.com/file/d/abcde/view', 'https://drive.google.com.evil.example/file/d/abcde/view', 'https://drive.google.com@evil.example/file/d/abcde/view', 'https://u:p@www.canva.com/design/ABCDE/view', 'https://www.canva.com/design/ABCDE/view?access_token=synthetic', 'https://drive.google.com/file/d/abcde/view?resourcekey=synthetic', 'https://www.canva.com:444/design/ABCDE/view', 'https://www.canva.com/design/ABCDE/view#secret', 'https://drive.google.com/file/d/abcde/view?code=synthetic']) assert.throws(() => canonicalAssetLink(url))
  assert.equal(canonicalAssetLink('https://www.canva.com/design/ABCDE/shareSegment/edit?utm_source=share').url, 'https://www.canva.com/design/ABCDE/view')
  assert.equal(canonicalAssetLink('https://drive.google.com/file/d/abcde/view?usp=sharing').url, 'https://drive.google.com/file/d/abcde/view')
  assert.equal(canonicalAssetLink('https://drive.google.com/drive/folders/abcde').source, 'drive')
})
test('bookmarks remain account-scoped, deduplicate canonically and do not touch existing posts', () => {
  const storage = memory(); storage.setItem('aasiflow-posts', 'original-content')
  const asset = createAssetLink('تصميم تجريبي', 'https://www.canva.com/design/ABCDE/edit')
  assert.equal(addAssetLink(storage, ownerA, asset).length, 1)
  assert.equal(readAssetLinks(storage, ownerB).length, 0)
  assert.throws(() => addAssetLink(storage, ownerA, createAssetLink('Other name', 'https://canva.com/design/ABCDE/view')), /already/)
  assert.equal(readAssetLinks(storage, ownerA)[0].title, 'تصميم تجريبي')
  removeAssetLink(storage, ownerB, asset.id)
  assert.equal(readAssetLinks(storage, ownerA).length, 1)
  assert.equal(removeAssetLink(storage, ownerA, asset.id).length, 0)
  assert.equal(storage.getItem('aasiflow-posts'), 'original-content')
})
test('corrupt, cross-account and full bookmark stores are preserved rather than overwritten', () => {
  for (const raw of ['broken-json', JSON.stringify({ version: 1, ownerId: ownerB, items: [] }), JSON.stringify({ version: 2, ownerId: ownerA, items: [] })]) {
    const storage = memory(); const key = `velo:asset-links:v1:${ownerA}`; storage.setItem(key, raw)
    assert.throws(() => addAssetLink(storage, ownerA, createAssetLink('Sample', 'https://www.canva.com/design/ABCDE/view')))
    assert.equal(storage.getItem(key), raw)
  }
  const storage = memory()
  for (let i = 0; i < 100; i++) addAssetLink(storage, ownerA, createAssetLink(`Sample ${i}`, `https://www.canva.com/design/ASSET${i}/view`))
  assert.throws(() => addAssetLink(storage, ownerA, createAssetLink('Overflow', 'https://www.canva.com/design/OVERFLOW/view')), /full/)
  assert.equal(readAssetLinks(storage, ownerA).length, 100)
})
test('a failed browser storage write does not pretend that a bookmark was saved', () => {
  const storage = memory(); const original = storage.setItem
  storage.setItem = () => { throw new Error('quota-failure') }
  assert.throws(() => addAssetLink(storage, ownerA, createAssetLink('Sample', 'https://www.canva.com/design/ABCDE/view')))
  storage.setItem = original
  assert.equal(readAssetLinks(storage, ownerA).length, 0)
})
test('Canva CSV preserves Arabic and escaping, bounds exports and neutralizes spreadsheet formulas', () => {
  const content = canvaBulkCsv([{ ...post, idea: '=1+1', caption: 'عرض "خاص", اليوم\nسطر ثان' }, { ...post, idea: '  @SUM(1)', caption: '+cmd' }])
  assert.ok(content.startsWith('\ufeffidea,caption,hashtags,language,platform\r\n'))
  assert.ok(content.includes('"\'=1+1"'))
  assert.ok(content.includes('"عرض ""خاص"", اليوم\nسطر ثان"'))
  assert.ok(content.includes('"\'  @SUM(1)"'))
  assert.ok(content.includes('"\'+cmd"'))
  assert.equal(canvaBulkCsv(Array.from({ length: 101 }, () => post)).split('\r\n').length, 102)
})
test('all five connector plans stay unconnected and never mutate, queue or publish existing content', async () => {
  const original = JSON.stringify(post)
  assert.equal(connectors.length, 5)
  for (const id of connectorIds) {
    const result = await previewPublication(post, id)
    assert.equal(result.mode, 'preview-only'); assert.equal(result.queued, false); assert.equal(result.published, false)
    assert.ok(result.blockers.includes('Live publishing is disabled.'))
    assert.ok(result.steps.length >= 4)
    assert.equal(JSON.stringify(post), original)
  }
  assert.ok((await previewPublication({ ...post, status: 'draft' }, 'instagram')).blockers.some(text => text.includes('approve')))
  assert.ok((await previewPublication(post, 'youtube-shorts')).blockers.some(text => text.includes('selected platform')))
  assert.ok(connectors.find(item => item.id === 'youtube-shorts').steps.some(text => text.includes('private')))
})
test('caption, media, schedule, platform, status and revision changes invalidate a publishing preview', async () => {
  const result = await previewPublication(post, 'instagram')
  assert.equal(await previewStillMatches(result, { ...post }), true)
  for (const change of [{ caption: 'Changed' }, { media: { path: `${ownerA}/sample.mp4`, type: 'video/mp4', size: 10, name: 'Sample' } }, { scheduledFor: '2099-01-01T10:00:00Z' }, { platform: 'LinkedIn' }, { status: 'draft' }, { revision: 3 }, { language: 'ar' }]) assert.equal(await previewStillMatches(result, { ...post, ...change }), false)
})
test('lead filter never invents business details or escalates a negated purchase intent', () => {
  const filter = createLeadFilter('sample-business', sampleFaqs)
  const faq = filter.process(message('What are your opening hours?'))
  assert.equal(faq.category, 'faq'); assert.equal(faq.suggestedReply, sampleFaqs[0].reply); assert.equal(faq.sent, false)
  const negative = filter.process(message('I do not want to book an appointment', { id: 'sample-2' }))
  assert.notEqual(negative.category, 'hot'); assert.equal(negative.routeCandidate, false)
  const unknown = filter.process(message('What is the exact price of this treatment?', { id: 'sample-3' }))
  assert.equal(unknown.category, 'human'); assert.equal(unknown.suggestedReply, null)
})
test('English and Arabic hot leads need explicit routing consent and duplicates cannot route twice', () => {
  for (const text of ['I want to book an appointment tomorrow', 'أريد حجز موعد غدا']) {
    const filter = createLeadFilter('sample-business', sampleFaqs)
    assert.equal(filter.process(message(text)).routeCandidate, false)
    const eligible = message(text, { id: 'sample-2', customerRoutingConsent: true })
    assert.equal(filter.process(eligible).routeCandidate, true)
    const repeated = filter.process(eligible)
    assert.equal(repeated.duplicate, true); assert.equal(repeated.routeCandidate, false); assert.equal(repeated.sent, false)
    assert.throws(() => filter.process({ ...eligible, text: 'Changed replay' }), /identifier/)
  }
})
test('opt-out and human takeover suppress automation only for their own conversation and business', () => {
  for (const first of ['STOP', 'Please stop messaging me', "Don't message me again", 'توقف', 'لا تراسلني', 'I need a human']) {
    const filter = createLeadFilter('sample-business', sampleFaqs)
    filter.process(message(first))
    assert.equal(filter.process(message('What are your opening hours?', { id: 'sample-2' })).suggestedReply, null)
    assert.equal(filter.process(message('What are your opening hours?', { id: 'sample-3', conversationId: 'different-customer' })).category, 'faq')
    assert.throws(() => filter.process(message('I want to book', { id: 'sample-4', businessId: 'different-business' })), /another business/)
  }
})
test('lead processing uses a frozen FAQ copy and rejects oversized enquiries and unbounded sessions', () => {
  const faqs = [{ id: 'hours', terms: ['opening hours'], reply: 'Approved answer' }]
  const filter = createLeadFilter('sample-business', faqs)
  faqs[0].reply = 'Changed after approval'; faqs[0].terms.push('unapproved')
  assert.equal(filter.process(message('opening hours')).suggestedReply, 'Approved answer')
  assert.equal(filter.process(message('unapproved', { id: 'sample-2' })).suggestedReply, null)
  assert.throws(() => filter.process(message('x'.repeat(2001), { id: 'sample-large' })))
  for (let i = 2; i < 200; i++) filter.process(message('sample', { id: `bounded-${i}` }))
  assert.throws(() => filter.process(message('sample', { id: 'overflow' })), /new sample session/)
})
test('WhatsApp raw-body authentication rejects tampering, wrong secrets and oversized deliveries', async () => {
  const secret = 'synthetic-signing-secret-only'
  const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}')
  const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  assert.equal(await verifyWhatsAppBody(body, signature, secret), true)
  assert.equal(await verifyWhatsAppBody(new TextEncoder().encode('{}'), signature, secret), false)
  assert.equal(await verifyWhatsAppBody(body, signature, 'different-synthetic-secret'), false)
  assert.equal(await verifyWhatsAppBody(body, null, secret), false)
  assert.equal(await verifyWhatsAppBody(body, signature, ''), false)
  assert.equal(await verifyWhatsAppBody(new Uint8Array(262145), signature, secret), false)
})
test('WhatsApp delivery must match both the business account and receiving phone id', () => {
  const value = { object: 'whatsapp_business_account', entry: [{ id: '123456', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '654321' } } }] }] }
  assert.equal(webhookBelongsToBusiness(value, '123456', '654321'), true)
  assert.equal(webhookBelongsToBusiness(value, '123456', '111111'), false)
  assert.equal(webhookBelongsToBusiness(value, '111111', '654321'), false)
  assert.equal(webhookBelongsToBusiness({ ...value, entry: [...value.entry, { ...value.entry[0], id: '111111' }] }, '123456', '654321'), false)
  assert.equal(webhookBelongsToBusiness({ object: 'whatsapp_business_account', entry: [] }, '123456', '654321'), false)
})
