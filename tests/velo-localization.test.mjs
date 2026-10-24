import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { arabic } from '../src/lib/translations.ts'
import { connectors } from '../src/features/publishing/connectors.ts'
import { sampleFaqs } from '../src/features/leads/filter.ts'
import { loadModule } from './helpers.mjs'

test('new module labels, provider prerequisites, stages and sample replies have Arabic translations', () => {
  const { veloArabic } = loadModule('../src/features/velo/locale.ts', { '../../lib/locale': { useLocale: () => ({ locale: 'en', t: text => text }) } })
  let checked = 0
  for (const file of ['../src/features/velo/ModuleWorkspace.tsx', '../src/features/assets/AssetBridge.tsx', '../src/features/publishing/PublisherPreview.tsx', '../src/features/leads/LeadSandbox.tsx']) {
    const source = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && ts.isStringLiteral(node.arguments[0])) {
        const value = node.arguments[0].text
        assert.ok(veloArabic[value] ?? arabic[value], `Missing Arabic module label: ${value}`)
        checked++
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  for (const connector of connectors) for (const text of [connector.requirement, ...connector.steps]) assert.ok(veloArabic[text], `Missing Arabic connector text: ${text}`)
  for (const faq of sampleFaqs) assert.ok(veloArabic[faq.reply])
  assert.ok(checked > 25)
})
