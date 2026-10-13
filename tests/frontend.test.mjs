import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

const draft = { caption: 'A draft to review', hashtags: ['Business', 'Tips', 'Growth'] }

test('AI transport is bounded, suppresses thrown SDK details and does not promise a quota reset',async()=>{
  for(const mode of ['session_throw','invoke_throw','limit']) {
    let calls=0
    const client={auth:{getSession:async()=>{if(mode==='session_throw')throw new Error('private-sentinel');return {data:{session:{}},error:null}}},functions:{invoke:async(_name,options)=>{calls++;assert.equal(options.timeout,60000);if(mode==='invoke_throw')throw new Error('private-sentinel');return {data:null,error:{context:{status:429}}}}}}
    const {generateAiDraft}=loadModule('../src/lib/ai.ts',{'./supabase':{supabase:client}})
    await assert.rejects(generateAiDraft('UAE business content tips','Instagram','Friendly'),error=>!error.message.includes('private-sentinel')&&!error.message.includes('midnight')&&(mode!=='limit'||error.message.includes('AI is paused')))
    assert.equal(calls,mode==='session_throw'?0:1)
  }
})
test('frontend rejects missing sessions, bad briefs, provider failures and malformed drafts', async () => {
  for (const scenario of ['no-session', 'bad-brief', 'provider-error', 'empty-caption', 'bad-tags', 'valid']) {
    let calls = 0
    const client = { auth: { getSession: async () => ({ data: { session: scenario === 'no-session' ? null : {} }, error: null }) }, functions: { invoke: async () => { calls++; return { data: scenario === 'empty-caption' ? { ...draft, caption: ' ' } : scenario === 'bad-tags' ? { ...draft, hashtags: ['#Invalid'] } : draft, error: scenario === 'provider-error' ? new Error('private-provider-detail') : null } } } }
    const { generateAiDraft } = loadModule('../src/lib/ai.ts', { './supabase': { supabase: client } })
    if (scenario === 'valid') assert.equal((await generateAiDraft('A valid idea for a post', 'Instagram', 'Friendly')).caption, draft.caption)
    else await assert.rejects(generateAiDraft(scenario === 'bad-brief' ? 'short' : 'A valid idea for a post', 'Instagram', 'Friendly'), (error) => !error.message.includes('private-provider-detail'))
    assert.equal(calls, ['no-session', 'bad-brief'].includes(scenario) ? 0 : 1)
  }
})

function generatorHarness(overrides = {}) {
  const states = []
  let cursor = 0
  const saves = []
  const jsx = (type, props) => ({ type, props })
  const react = { useState: (initial) => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] }, useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: () => {} }
  const { Generator, Calendar } = loadModule('../src/App.tsx', { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': {}, './components/MediaInput': { MediaInput: 'media-input', MediaPreview: 'media-preview' }, './MediaLibrary': {}, './AdminDashboard': {}, './BetaGate': {}, './lib/monitoring': { reportRuntimeError: async () => {} }, './LanguageSwitcher': {}, './lib/locale': { useLocale: () => ({ t: (text) => text }) }, './lib/workflow': { validatePost: () => {} }, './lib/auth': {}, './lib/content': {}, './lib/ai': { generateAiDraft: overrides.generate ?? (async () => draft) }, './lib/posts': {}, './lib/supabase': { isSupabaseConfigured: true } }, '\nexport { Generator, Calendar }')
  const post = { id: 'draft-id', idea: 'A valid idea for a post', platform: 'Instagram', tone: 'Friendly', ...draft, status: 'draft', createdAt: '2026-01-01T00:00:00Z' }
  function render() {
    cursor = 0
    const tree = overrides.calendar
      ? Calendar({ posts: overrides.posts ?? [post], onUpdate: async (value) => saves.push(value), onView: () => {}, disabled: false })
      : Generator({ initialPost: post, onSave: async (value) => { saves.push(value); return { ...value, revision: (value.revision ?? 0) + 1 } }, disabled: false })
    const nodes = []
    function visit(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(visit); return } nodes.push(node); visit(node.props?.children) }
    visit(tree)
    return nodes
  }
  return { render, saves }
}
const checkbox = (nodes) => nodes.find((node) => node.props?.id === 'approve')
const approveButton = (nodes) => nodes.find((node) => node.type === 'button' && node.props.children?.includes('Approve & save'))
test('approval requires a fresh checkbox action and cannot revive after an edit is reverted', () => {
  for (const field of ['idea', 'platform', 'tone', 'caption', 'hashtags']) {
    const { render } = generatorHarness()
    let nodes = render()
    assert.equal(approveButton(nodes).props.disabled, true)
    checkbox(nodes).props.onChange({ target: { checked: true } })
    nodes = render()
    assert.equal(approveButton(nodes).props.disabled, false)
    const control = field === 'idea' ? nodes.find((n) => n.type === 'textarea' && n.props.maxLength === 500) : field === 'caption' ? nodes.find((n) => n.props?.className === 'caption') : field === 'hashtags' ? nodes.find((n) => n.type === 'input' && !n.props.id) : nodes.filter((n) => n.type === 'select')[field === 'platform' ? 0 : 1]
    const original = control.props.value
    control.props.onChange({ target: { value: field === 'platform' ? 'LinkedIn' : field === 'tone' ? 'Bold' : 'Changed content' } })
    nodes = render()
    assert.equal(checkbox(nodes).props.checked, false)
    control.props.onChange({ target: { value: original } })
    nodes = render()
    assert.equal(approveButton(nodes).props.disabled, true, `${field} revert must require reapproval`)
    checkbox(nodes).props.onChange({ target: { checked: true } })
    assert.equal(approveButton(render()).props.disabled, false)
  }
})
test('an unapproved save action cannot persist approved content', async () => {
  const { render, saves } = generatorHarness()
  approveButton(render()).props.onClick()
  await Promise.resolve()
  assert.equal(saves.length, 0)
  checkbox(render()).props.onChange({ target: { checked: true } })
  approveButton(render()).props.onClick()
  await Promise.resolve()
  assert.equal(saves.length, 1)
  assert.equal(saves[0].status, 'approved')
})
test('generation alone never saves or approves content', async () => {
  const { render, saves } = generatorHarness()
  checkbox(render()).props.onChange({ target: { checked: true } })
  render().find((n) => n.type === 'button' && n.props.children?.includes('Generate draft')).props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  const nodes = render()
  assert.equal(saves.length, 0)
  assert.equal(checkbox(nodes).props.checked, false)
  assert.equal(approveButton(nodes).props.disabled, true)
})
test('failed regeneration clears stale content and displays the error', async () => {
  const { render, saves } = generatorHarness({ generate: async () => { throw new Error('AI generation is unavailable.') } })
  render().find((n) => n.type === 'button' && n.props.children?.includes('Generate draft')).props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  const nodes = render()
  assert.equal(checkbox(nodes), undefined)
  assert.equal(nodes.find((n) => n.props?.role === 'alert').props.children, 'AI generation is unavailable.')
  assert.equal(saves.length, 0)
})
test('draft saves are allowed without approval and retain draft status', async () => {
  const { render, saves } = generatorHarness()
  render().find((n) => n.props?.className === 'ghost draft-save').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saves.length, 1)
  assert.equal(saves[0].status, 'draft')
})
test('calendar excludes drafts, rejects past dates, and schedules only approved content', async () => {
  const hidden = generatorHarness({ calendar: true })
  assert.equal(hidden.render().some((n) => n.type === 'input'), false)
  const post = { id: 'approved-id', idea: 'Approved post', platform: 'Instagram', ...draft, status: 'approved' }
  const { render, saves } = generatorHarness({ calendar: true, posts: [post] })
  let nodes = render()
  nodes.find((n) => n.type === 'input').props.onChange({ target: { value: '2000-01-01T10:00' } })
  nodes = render()
  nodes.find((n) => n.type === 'button' && n.props.children?.includes('Schedule')).props.onClick()
  assert.equal(saves.length, 0)
  nodes = render()
  assert.match(nodes.find((n) => n.props?.role === 'alert').props.children, /future/)
  nodes.find((n) => n.type === 'input').props.onChange({ target: { value: '2099-01-01T10:00' } })
  nodes = render()
  nodes.find((n) => n.type === 'button' && n.props.children?.includes('Schedule')).props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saves.length, 1)
  assert.equal(saves[0].status, 'scheduled')
  assert.ok(new Date(saves[0].scheduledFor).getTime() > Date.now())
})

test('composer carries the server revision forward across repeated saves', async () => {
  const { render, saves } = generatorHarness()
  const saveDraft = nodes => nodes.find(node => node.props?.className === 'ghost draft-save')
  await saveDraft(render()).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  await saveDraft(render()).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saves.length, 2)
  assert.equal(saves[1].revision, 1)
})

test('attachment changes clear explicit approval even after the attachment is reverted', () => {
  const { render } = generatorHarness()
  checkbox(render()).props.onChange({target:{checked:true}})
  assert.equal(approveButton(render()).props.disabled,false)
  const control = render().find(node => node.type === 'media-input')
  control.props.onChange({path:'user/file',type:'image/png',name:'Fixture',size:9})
  assert.equal(checkbox(render()).props.checked,false)
  control.props.onChange(undefined)
  assert.equal(approveButton(render()).props.disabled,true)
})
