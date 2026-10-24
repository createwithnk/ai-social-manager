import test from 'node:test'
import assert from 'node:assert/strict'
import { assetMetadata, authorizationLink, connectionStatus, createAssetConnectionApi, inspectReference } from '../src/features/assets/connections.ts'

const callback = 'https://nkfecpdegcmsapvbviky.supabase.co/functions/v1/velo-asset-callback'
function authorization(provider = 'canva') {
  const url = new URL(provider === 'canva' ? 'https://www.canva.com/api/oauth/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({ client_id: 'fixture_client', response_type: 'code', redirect_uri: callback, scope: provider === 'canva' ? 'design:meta:read' : 'https://www.googleapis.com/auth/drive.file', state: 'a'.repeat(64), code_challenge: 'b'.repeat(43), code_challenge_method: 'S256', ...(provider === 'drive' ? { access_type: 'offline', prompt: 'consent select_account' } : {}) }).toString()
  return url
}
test('asset consent links accept only the intended provider, callback, scopes and PKCE without secret query fields', () => {
  for (const provider of ['canva', 'drive']) assert.equal(authorizationLink(authorization(provider).toString(), provider), authorization(provider).toString())
  for (const change of [url => { url.hostname = 'evil.example' }, url => url.searchParams.set('redirect_uri', 'https://evil.example'), url => url.searchParams.set('client_secret', 'fixture-secret'), url => url.searchParams.set('scope', 'anything'), url => url.searchParams.append('state', 'a'.repeat(64)), url => url.searchParams.set('code_challenge_method', 'plain')]) {
    const url = authorization(); change(url); assert.throws(() => authorizationLink(url.toString(), 'canva'))
  }
})
test('asset status exposes only bounded, unique provider metadata and rejects malformed server summaries', () => {
  const value = { enabled: true, configured: { canva: true, drive: false }, connections: [{ provider: 'canva', status: 'connected', accountName: 'Fixture', encryptedGrant: 'secret-fixture' }] }
  assert.equal(JSON.stringify(connectionStatus(value)).includes('secret-fixture'), false)
  for (const bad of [{ ...value, connections: [...value.connections, ...value.connections] }, { ...value, connections: [{ ...value.connections[0], provider: 'unknown' }] }, { ...value, configured: {} }]) assert.throws(() => connectionStatus(bad))
})
test('asset metadata requires the selected exact file and never turns a viewer link into a media download', () => {
  assert.deepEqual(inspectReference('https://drive.google.com/file/d/file_fixture/view'), { provider: 'drive', assetId: 'file_fixture' })
  assert.throws(() => inspectReference('https://drive.google.com/drive/folders/folder_fixture'))
  assert.throws(() => inspectReference('https://www.canva.com/design/design_fixture/view?access_token=x'))
  const expected = { provider: 'drive', assetId: 'file_fixture' }, asset = { provider: 'drive', id: 'file_fixture', title: 'Test file', mimeType: 'image/png', bytes: 100, canDownload: true, downloadUrl: 'https://private.invalid' }
  assert.equal('downloadUrl' in assetMetadata({ asset }, expected), false)
  assert.throws(() => assetMetadata({ asset: { ...asset, id: 'wrong_file' } }, expected))
  assert.throws(() => assetMetadata({ asset: { ...asset, bytes: -1 } }, expected))
})
test('asset client sends only operation/provider/file fields and preserves original-file and post ownership', async () => {
  const calls = []
  const api = createAssetConnectionApi(async body => {
    calls.push(body)
    if (body.action === 'status') return { enabled: false, configured: { canva: true, drive: false }, connections: [] }
    if (body.action === 'start') return { authorizationUrl: authorization().toString() }
    if (body.action === 'inspect') return { asset: { provider: 'canva', id: 'design_fixture', title: 'Fixture', mimeType: null, bytes: null, canDownload: null } }
    return { provider: body.provider, disconnected: true }
  })
  await api.status(); await api.start('canva'); await api.inspect('https://www.canva.com/design/design_fixture/view'); await api.disconnect('canva')
  assert.deepEqual(calls, [{ action: 'status' }, { action: 'start', provider: 'canva' }, { action: 'inspect', provider: 'canva', assetId: 'design_fixture' }, { action: 'disconnect', provider: 'canva' }])
  await assert.rejects(api.inspect('https://evil.example/file_fixture')); assert.equal(calls.length, 4)
})
test('an unacknowledged asset disconnect is not presented as success', async () => {
  const api = createAssetConnectionApi(async () => ({ disconnected: false, provider: 'canva' }))
  await assert.rejects(api.disconnect('canva'))
})
