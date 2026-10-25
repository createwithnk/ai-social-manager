import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

test('media library does not offer deletion without a Storage DELETE policy', async () => {
  const states = []
  let cursor = 0, mounted = false
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
    './lib/beta-policy': { betaUploadsEnabled: false, betaUploadNotice: 'Uploads paused' },
    './lib/media': { listMedia: async () => [item], deleteMedia: async (...args) => deleted.push(args), uploadMedia: async () => {} },
  }, '', { window: { confirm: () => { throw new Error('Deletion must not be offered') } } })
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
  assert.equal(button(), undefined)
  assert.ok(render().some(node => node.props?.children === 'Media deletion requires owner maintenance.'))
  assert.equal(deleted.length, 0)
})
