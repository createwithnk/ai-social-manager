import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

test('media deletion requires confirmation; cancellation leaves media unchanged', async () => {
  const states = []
  let cursor = 0, mounted = false, confirmed = false
  const deleted = []
  const item = { path: 'user-a/file.png', url: 'https://example.invalid/private-preview', kind: 'image' }
  const jsx = (type, props) => ({ type, props })
  const { default: MediaLibrary } = loadModule('../src/MediaLibrary.tsx', {
    react: {
      useState: (initial) => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
      useCallback: (fn) => fn,
      useEffect: (fn) => { if (!mounted) { fn(); mounted = true } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx }, './lib/locale': { useLocale: () => ({ t: (text) => text }) },
    './lib/media': { listMedia: async () => [item], deleteMedia: async (...args) => deleted.push(args), uploadMedia: async () => {} },
  }, '', { window: { confirm: () => confirmed } })
  function render() {
    cursor = 0
    const tree = MediaLibrary({ userId: 'user-a' })
    const nodes = []
    function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return; nodes.push(node); visit(node.props?.children) }
    visit(tree)
    return nodes
  }
  render()
  await new Promise((resolve) => setImmediate(resolve))
  const button = () => render().find((node) => node.type === 'button' && node.props.children === 'Delete media')
  button().props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(deleted.length, 0)
  assert.ok(button())
  confirmed = true
  button().props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(deleted[0], ['user-a', item.path])
  assert.equal(button(), undefined)
})
