import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { arabic, translate } from '../src/lib/translations.ts'
import { loadModule } from './helpers.mjs'

test('core interface labels have Arabic translations without changing English', () => {
  const exceptions = new Set(['AasiFlowAI', '1', '2', '3', 'العربية'])
  for (const file of ['../src/App.tsx', '../src/MediaLibrary.tsx']) {
    const source = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && ts.isStringLiteral(node.arguments[0])) {
        const text = node.arguments[0].text
        assert.equal(translate('en', text), text)
        assert.equal(text in arabic || exceptions.has(text), true, `Missing Arabic label: ${text}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.equal(translate('ar', 'Unknown provider error'), 'Unknown provider error')
})
test('locale preference changes document language and direction; storage failure is tolerated', () => {
  for (const storageFails of [false, true]) {
    let selected
    const document = { documentElement: {} }
    const storage = { getItem: () => { if (storageFails) throw new Error('blocked'); return 'ar' }, setItem: () => { if (storageFails) throw new Error('blocked') } }
    const jsx = (type, props) => ({ type, props })
    const { default: Provider } = loadModule('../src/LocaleProvider.tsx', {
      react: { useState: (initial) => { selected ??= initial(); return [selected, (value) => { selected = value }] }, useEffect: (fn) => fn(), useMemo: (fn) => fn() },
      'react/jsx-runtime': { jsx }, './lib/locale': { LocaleContext: { Provider: 'provider' } }, './lib/translations': { translate },
    }, '', { document, localStorage: storage })
    const initial = Provider({ children: 'child' })
    assert.equal(document.documentElement.dir, storageFails ? 'ltr' : 'rtl')
    initial.props.value.setLocale('ar')
    const changed = Provider({ children: 'child' })
    assert.equal(document.documentElement.lang, 'ar')
    assert.equal(document.documentElement.dir, 'rtl')
    assert.equal(changed.props.value.t('Dashboard'), arabic.Dashboard)
    changed.props.value.setLocale('en')
    Provider({ children: 'child' })
    assert.equal(document.documentElement.dir, 'ltr')
  }
})
