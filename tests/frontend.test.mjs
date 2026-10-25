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
  const { Generator, Calendar, PostDetail } = loadModule('../src/App.tsx', { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': {}, './components/MediaInput': { MediaInput: 'media-input', MediaPreview: 'media-preview' }, './features/velo/ModuleWorkspace': {}, './features/velo-hub/VeloWorkspaceHub': {}, './MediaLibrary': {}, './AdminDashboard': {}, './BetaGate': {}, './lib/monitoring': { reportRuntimeError: async () => {} }, './LanguageSwitcher': {}, './lib/locale': { useLocale: () => ({ t: (text) => text }) }, './lib/workflow': { validatePost: () => {}, ...loadModule('../src/lib/workflow.ts') }, './lib/auth': {}, './lib/content': {}, './lib/ai': { generateAiDraft: overrides.generate ?? (async () => draft) }, './lib/posts': {}, './lib/supabase': { isSupabaseConfigured: true } }, '\nexport { Generator, Calendar, PostDetail }')
  const post = { id: 'draft-id', idea: 'A valid idea for a post', platform: 'Instagram', tone: 'Friendly', ...draft, status: 'draft', createdAt: '2026-01-01T00:00:00Z', ...overrides.post }
  function render() {
    cursor = 0
    const tree = overrides.detail
      ? PostDetail({ post, onBack: () => {}, onEdit: async value => { if (overrides.edit) await overrides.edit(value); saves.push(value) }, disabled: overrides.disabled ?? false })
      : overrides.calendar
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
const draftButton = (nodes) => nodes.find((node) => node.props?.className === 'ghost draft-save')
test('approval requires a fresh checkbox action and cannot revive after an edit is reverted', () => {
  for (const field of ['idea', 'platform', 'tone', 'caption', 'hashtags']) {
    const { render } = generatorHarness()
    let nodes = render()
    assert.equal(approveButton(nodes).props.disabled, true)
    assert.equal(draftButton(nodes).props.disabled, true)
    checkbox(nodes).props.onChange({ target: { checked: true } })
    nodes = render()
    assert.equal(approveButton(nodes).props.disabled, false)
    assert.equal(draftButton(nodes).props.disabled, false)
    const control = field === 'idea' ? nodes.find((n) => n.type === 'textarea' && n.props.maxLength === 500) : field === 'caption' ? nodes.find((n) => n.props?.className === 'caption') : field === 'hashtags' ? nodes.find((n) => n.type === 'input' && !n.props.id) : nodes.filter((n) => n.type === 'select')[field === 'platform' ? 0 : 1]
    const original = control.props.value
    control.props.onChange({ target: { value: field === 'platform' ? 'LinkedIn' : field === 'tone' ? 'Bold' : 'Changed content' } })
    nodes = render()
    assert.equal(checkbox(nodes).props.checked, false)
    control.props.onChange({ target: { value: original } })
    nodes = render()
    assert.equal(approveButton(nodes).props.disabled, true, `${field} revert must require reapproval`)
    assert.equal(draftButton(nodes).props.disabled, true, `${field} revert must not permit a draft save`)
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
test('draft saves require explicit review, retain draft status, and consume consent', async () => {
  const { render, saves } = generatorHarness()
  assert.equal(draftButton(render()).props.disabled, true)
  draftButton(render()).props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saves.length, 0, 'Even direct invocation must not bypass review')
  checkbox(render()).props.onChange({ target: { checked: true } })
  assert.equal(draftButton(render()).props.disabled, false)
  draftButton(render()).props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saves.length, 1)
  assert.equal(saves[0].status, 'draft')
  assert.equal(saves[0].scheduledFor, undefined)
  assert.equal(checkbox(render()).props.checked, false)
  assert.equal(draftButton(render()).props.disabled, true)
  draftButton(render()).props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saves.length, 1, 'A subsequent save requires fresh consent')
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
  checkbox(render()).props.onChange({ target: { checked: true } })
  await saveDraft(render()).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  checkbox(render()).props.onChange({ target: { checked: true } })
  await saveDraft(render()).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saves.length, 2)
  assert.equal(saves[1].revision, 1)
})

test('reschedule persists the time shown to the user, not the default tomorrow', async () => {
  const post = { id: 'scheduled-id', idea: 'Approved post', platform: 'Instagram', ...draft, status: 'scheduled', scheduledFor: '2099-05-20T16:45:00.000Z' }
  const { render, saves } = generatorHarness({ calendar: true, posts: [post] })
  const nodes = render()
  const shown = nodes.find(node => node.type === 'input').props.value
  nodes.find(node => node.type === 'button' && node.props.children?.includes('Reschedule')).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saves.length, 1)
  assert.equal(saves[0].scheduledFor, new Date(shown).toISOString())
  assert.equal(saves[0].scheduledFor, post.scheduledFor)
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

test('approved and scheduled detail views cannot start editing without explicit confirmation', async () => {
  for (const status of ['approved', 'scheduled']) {
    const { render, saves } = generatorHarness({ detail: true, post: { status } })
    let nodes = render()
    const editButton = list => list.find(node => node.type === 'button' && node.props.className === 'primary')
    assert.equal(editButton(nodes).props.disabled, true)
    editButton(nodes).props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(saves.length, 0)
    nodes.find(node => node.props?.id === 'confirm-edit').props.onChange({ target: { checked: true } })
    nodes = render()
    assert.equal(editButton(nodes).props.disabled, false)
    editButton(nodes).props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(saves.length, 1)
    assert.equal(saves[0].status, status, 'Detail passes the reviewed post to the existing revision-safe transition')
  }
})

test('draft detail editing needs no destructive-transition confirmation and respects busy state', async () => {
  for (const disabled of [true, false]) {
    const { render, saves } = generatorHarness({ detail: true, disabled })
    const nodes = render()
    assert.equal(nodes.some(node => node.props?.id === 'confirm-edit'), false)
    const edit = nodes.find(node => node.type === 'button' && node.props.className === 'primary')
    assert.equal(edit.props.disabled, disabled)
    edit.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(saves.length, disabled ? 0 : 1)
  }
})

test('a failed detail transition retains the read-only post and allows a deliberate retry', async () => {
  const { render, saves } = generatorHarness({ detail: true, post: { status: 'scheduled', scheduledFor: '2099-01-01T10:00:00Z' }, edit: async () => { throw new Error('Revision conflict') } })
  render().find(node => node.props?.id === 'confirm-edit').props.onChange({ target: { checked: true } })
  const edit = render().find(node => node.type === 'button' && node.props.className === 'primary')
  edit.props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saves.length, 0)
  assert.equal(render().find(node => node.type === 'button' && node.props.className === 'primary').props.disabled, false)
  assert.ok(render().some(node => node.props?.className === 'status scheduled'))
})
