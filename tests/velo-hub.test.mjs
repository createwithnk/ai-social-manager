import test from 'node:test'
import assert from 'node:assert/strict'
import { veloModules, moduleTitle } from '../src/features/velo-hub/modules.ts'
test('hub lists the four independent workspace modules in a stable order',()=>{assert.deepEqual(veloModules.map(module=>module.id),['drive-import','canva-bridge','social-publishing','whatsapp-lead-agent']);assert.equal(new Set(veloModules.map(module=>module.id)).size,4)})
test('module cards have English and Arabic titles and descriptions',()=>{for(const module of veloModules){assert.ok(module.title.en.length>2);assert.ok(module.title.ar.length>2);assert.ok(module.description.en.length>8);assert.ok(module.description.ar.length>8);assert.equal(moduleTitle(module.id,'en'),module.title.en);assert.equal(moduleTitle(module.id,'ar'),module.title.ar)}})
