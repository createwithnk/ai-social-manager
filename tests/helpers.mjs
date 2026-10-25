import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

export function loadModule(path, mocks, extra = '', globals = {}) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(source, { exports, Error, require: (name) => { if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`); return mocks[name] }, crypto: { randomUUID: () => 'test-post-id' }, ...globals })
  return exports
}
