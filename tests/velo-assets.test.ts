// Synthetic transports only. Deno receives no network permission.
import { ASSET_CALLBACK_URL, ASSET_PROJECT_URL, DRIVE_FILE_SCOPE, AssetError, assetAuthorizationUrl, assetJsonRequest, exchangeAssetCode, inspectProviderAsset, pkceChallenge, refreshAssetGrant, type AssetGrant, type AssetProvider } from '../supabase/functions/_shared/asset-bridge/protocol.ts'
import { assetRequestJSON, createAssetAccountHandler, createAssetCallbackHandler, inspectConnectedAsset, type AssetConfig, type AssetIdentity, type AssetRuntime } from '../supabase/functions/_shared/asset-bridge/service.ts'
import { assetProjectFetch, createAssetRuntime, loadAssetConfig } from '../supabase/functions/_shared/asset-bridge/runtime.ts'
import { decryptToken, encryptToken } from '../supabase/functions/_shared/security.ts'

const U = 'a1111111-1111-4111-8111-111111111111', S = 'a3333333-3333-4333-8333-333333333333', C = 'c5555555-5555-4555-8555-555555555555', G = 'd6666666-6666-4666-8666-666666666666', L = 'e7777777-7777-4777-8777-777777777777'
const owner: AssetIdentity = { userId: U, sessionId: S }, now = 1803340800000
const config: AssetConfig = { enabled: true, appUrl: 'https://velo.example/', tokenKey: btoa('0123456789abcdef'.repeat(2)), clients: { canva: { clientId: 'canva_fixture', clientSecret: 'canva-fixture-client-secret' }, drive: { clientId: 'drive-fixture.apps.googleusercontent.com', clientSecret: 'drive-fixture-client-secret' } } }
const grant = (provider: AssetProvider, expiresAt = now + 3600000): AssetGrant => ({ accessToken: 'fixture-access-token', refreshToken: 'fixture-refresh-token', expiresAt, scopes: [provider === 'canva' ? 'design:meta:read' : DRIVE_FILE_SCOPE], accountId: 'account_fixture', accountName: 'Fixture account' })
function assert(value: unknown, message = 'Asset assertion failed'): asserts value { if (!value) throw new Error(message) }
function equal(actual: unknown, expected: unknown) { assert(JSON.stringify(actual) === JSON.stringify(expected), 'Unexpected synthetic asset result') }
async function rejects(fn: () => Promise<unknown>, code?: string) { try { await fn() } catch (error) { if (code) assert(error instanceof AssetError && error.code === code); return } throw new Error('Expected asset rejection') }
function neverFetch(): Promise<Response> { throw new Error('Unexpected synthetic transport call') }
function sequence(values: unknown[], inspect?: (url: string, init: RequestInit, index: number) => void): typeof fetch {
  let index = 0
  return (input, init) => { inspect?.(String(input), init ?? {}, index); assert(index < values.length); return Promise.resolve(Response.json(values[index++])) }
}
function request(body: unknown, origin = 'https://velo.example') { return new Request(ASSET_PROJECT_URL + '/functions/v1/velo-asset-account', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Authorization: 'Bearer fixture' }, body: JSON.stringify(body) }) }
function runtime(command: AssetRuntime['command'], fetcher: typeof fetch = neverFetch): AssetRuntime { return { config: () => config, identify: () => Promise.resolve(owner), command, fetcher, now: () => now } }
const canvaToken = { access_token: 'fixture-new-access', refresh_token: 'fixture-new-refresh', token_type: 'Bearer', expires_in: 3600 }
const introspection = { active: true, client: config.clients.canva!.clientId, scope: 'design:meta:read', exp: now / 1000 + 1800, sub: 'account_fixture' }
const driveToken = { ...canvaToken, scope: DRIVE_FILE_SCOPE }

Deno.test('asset PKCE matches the RFC vector and consent URLs contain no client secret/verifier', async () => {
  equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  for (const provider of ['canva', 'drive'] as AssetProvider[]) {
    const url = new URL(await assetAuthorizationUrl(provider, config.clients[provider]!, 'a'.repeat(64), 'b'.repeat(64)))
    equal(url.searchParams.get('redirect_uri'), ASSET_CALLBACK_URL); equal(url.searchParams.get('response_type'), 'code'); equal(url.searchParams.get('code_challenge_method'), 'S256')
    equal(url.searchParams.get('scope'), grant(provider).scopes[0]); assert(!url.toString().includes(config.clients[provider]!.clientSecret)); assert(!url.toString().includes('b'.repeat(64)))
    if (provider === 'drive') equal(url.searchParams.get('access_type'), 'offline')
  }
  await rejects(() => pkceChallenge('short'), 'request_rejected')
})
Deno.test('asset transport rejects alternate hosts, endpoints, methods and query credentials before I/O', async () => {
  for (const url of ['https://api.canva.com.evil.example/rest/v1/oauth/token', 'http://api.canva.com/rest/v1/oauth/token', 'https://x:y@api.canva.com/rest/v1/oauth/token', 'https://api.canva.com/rest/v1/oauth/token?secret=x', 'https://www.googleapis.com/drive/v3/files/file_fixture?alt=media', 'https://www.googleapis.com/drive/v3/files/file_fixture?fields=id&fields=secret', 'https://api.canva.com/rest/v1/autofills']) await rejects(() => assetJsonRequest(url, { method: 'POST' }, neverFetch), 'request_rejected')
  await rejects(() => assetJsonRequest('https://api.canva.com/rest/v1/designs/design_fixture', { method: 'DELETE' }, neverFetch), 'request_rejected')
})
Deno.test('asset transport bounds headers, decompressed bytes and body time and never follows redirects', async () => {
  const endpoint = 'https://api.canva.com/rest/v1/oauth/token'
  await rejects(() => assetJsonRequest(endpoint, { method: 'POST' }, () => Promise.resolve(new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }))), 'provider_unavailable')
  await rejects(() => assetJsonRequest(endpoint, { method: 'POST' }, () => Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'text/html' } }))), 'provider_unavailable')
  await rejects(() => assetJsonRequest(endpoint, { method: 'POST' }, () => Promise.resolve(Response.json({ padded: 'x'.repeat(65537) }))), 'provider_unavailable')
  await rejects(() => assetJsonRequest(endpoint, { method: 'POST' }, () => Promise.resolve(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) } }), { headers: { 'Content-Type': 'application/json' } })), 5), 'provider_unavailable')
  await rejects(() => assetJsonRequest(endpoint, { method: 'POST' }, () => new Promise(() => {}), 5), 'provider_unavailable')
  await rejects(() => assetJsonRequest(endpoint, { method: 'POST' }, () => Promise.resolve(new Response(null, { status: 401 }))), 'connection_required')
})
Deno.test('Canva code exchange is confidential, introspected and bounded by the earlier expiry', async () => {
  const fetcher = sequence([canvaToken, introspection], (url, init, index) => {
    equal(init.method, 'POST'); equal(init.redirect, 'error'); equal(init.credentials, 'omit')
    const headers = new Headers(init.headers); assert(headers.get('Authorization')?.startsWith('Basic '))
    const body = new URLSearchParams(String(init.body))
    assert(!body.has('client_secret')); assert(url.startsWith('https://api.canva.com/rest/v1/oauth/'))
    if (index === 0) { equal(body.get('code_verifier'), 'c'.repeat(64)); equal(body.get('redirect_uri'), ASSET_CALLBACK_URL) }
    else equal(body.get('token'), canvaToken.access_token)
  })
  const result = await exchangeAssetCode('canva', config.clients.canva!, 'fixture-code', 'c'.repeat(64), fetcher, now)
  equal(result.accountId, 'account_fixture'); equal(result.expiresAt, now + 1800000)
  for (const info of [{ ...introspection, active: false }, { ...introspection, client: 'wrong_client' }, { ...introspection, scope: 'design:content:read' }, { ...introspection, exp: now / 1000 }]) await rejects(() => exchangeAssetCode('canva', config.clients.canva!, 'fixture-code', 'c'.repeat(64), sequence([canvaToken, info]), now), 'connection_required')
})
Deno.test('Drive validates selected-file scope, refresh capability and stable account identity', async () => {
  const info = { user: { permissionId: 'account_fixture', displayName: 'Test owner' } }
  const result = await exchangeAssetCode('drive', config.clients.drive!, 'fixture-code', 'c'.repeat(64), sequence([driveToken, info]), now)
  equal(result.accountName, 'Test owner'); equal(result.scopes, [DRIVE_FILE_SCOPE])
  await rejects(() => exchangeAssetCode('drive', config.clients.drive!, 'fixture-code', 'c'.repeat(64), sequence([{ ...driveToken, refresh_token: undefined }, info]), now), 'connection_required')
  await rejects(() => exchangeAssetCode('drive', config.clients.drive!, 'fixture-code', 'c'.repeat(64), sequence([{ ...driveToken, scope: 'openid' }, info]), now), 'connection_required')
  const refreshed = await refreshAssetGrant('drive', config.clients.drive!, result, sequence([{ ...driveToken, refresh_token: undefined, scope: undefined }, info]), now)
  equal(refreshed.refreshToken, result.refreshToken)
  await rejects(() => refreshAssetGrant('drive', config.clients.drive!, result, sequence([driveToken, { user: { permissionId: 'different_account' } }]), now), 'connection_required')
  await rejects(() => refreshAssetGrant('canva', config.clients.canva!, grant('canva'), sequence([{ ...canvaToken, refresh_token: undefined }]), now), 'connection_required')
})
Deno.test('asset inspection is metadata-only, checks exact identity and does not expose download URLs', async () => {
  const fetcher = sequence([{ id: 'file_fixture', name: 'Poster.png', size: '2500', mimeType: 'image/png', trashed: false, capabilities: { canDownload: true }, webContentLink: 'https://example.invalid/private' }], (url, init) => { assert(url.includes('fields=')); assert(!url.includes('alt=media')); equal(init.method, undefined) })
  const value = await inspectProviderAsset('drive', 'file_fixture', grant('drive'), fetcher)
  equal(value.bytes, 2500); assert(!JSON.stringify(value).includes('webContentLink'))
  await rejects(() => inspectProviderAsset('drive', 'file_fixture', grant('drive'), sequence([{ id: 'other_file', name: 'Wrong', trashed: false }])), 'invalid_asset')
  await rejects(() => inspectProviderAsset('drive', 'file_fixture', grant('drive'), sequence([{ id: 'file_fixture', name: 'Trashed', trashed: true }])), 'invalid_asset')
  await rejects(() => inspectProviderAsset('canva', '../escape', grant('canva'), neverFetch), 'invalid_asset')
})
Deno.test('asset configuration refuses another project before reading any credential and has no generic provider fallback', () => {
  const names: string[] = []
  try { loadAssetConfig(name => { names.push(name); return name === 'SUPABASE_URL' ? 'https://wrong-project.supabase.co' : '' }); throw new Error('Unexpected configuration acceptance') }
  catch (error) { assert(error instanceof AssetError); equal(names, ['SUPABASE_URL']) }
  const values: Record<string, string> = { SUPABASE_URL: ASSET_PROJECT_URL, AASIFLOW_ASSET_APP_URL: config.appUrl, AASIFLOW_ASSET_TOKEN_KEY: config.tokenKey, GOOGLE_CLIENT_ID: config.clients.drive!.clientId, GOOGLE_CLIENT_SECRET: config.clients.drive!.clientSecret, GEMINI_API_KEY: 'unused-fixture' }
  const result = loadAssetConfig(name => values[name] ?? '')
  equal(result.clients, {}); equal(result.enabled, false)
})
Deno.test('asset endpoint denies wrong origins, closed starts and forged owner fields without Auth/DB/provider I/O', async () => {
  let touched = false
  const r = runtime(() => { touched = true; throw new Error() }); r.config = () => ({ ...config, enabled: false }); r.identify = () => { touched = true; throw new Error() }
  const handler = createAssetAccountHandler(r)
  equal((await handler(request({ action: 'start', provider: 'drive' }))).status, 423)
  equal((await handler(request({ action: 'start', provider: 'drive' }, 'https://wrong.example'))).status, 403)
  equal((await handler(request({ action: 'start', provider: 'drive', userId: U }))).status, 400)
  equal(touched, false)
})
Deno.test('asset request parser bounds bytes and slow streamed bodies', async () => {
  await rejects(() => assetRequestJSON(request({ padded: 'x'.repeat(4097) })), 'request_rejected')
  const req = new Request('https://velo.example/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) } }) })
  await rejects(() => assetRequestJSON(req, 5), 'request_rejected')
})
Deno.test('asset callback consumes hashed state once, binds the original owner and returns no code, state or token', async () => {
  let pending: Record<string, unknown> | null = null; const saved: Record<string, unknown>[] = []
  const r = runtime(async (op, who, p) => {
    if (op === 'begin') { equal(who, owner); pending = { ...p, id: C, generation: G, userId: U, sessionId: S }; return { id: C, generation: G } }
    if (op === 'take') { assert(who === null); const value = pending; pending = null; return value?.stateHash === p.stateHash ? value : null }
    if (op === 'save') { equal(who, owner); saved.push(p); return true }
    throw new Error('Unexpected command')
  }, sequence([canvaToken, introspection]))
  const response = await createAssetAccountHandler(r)(request({ action: 'start', provider: 'canva' }))
  equal(response.status, 200)
  const url = new URL((await response.json()).authorizationUrl), state = url.searchParams.get('state')!
  const callback = createAssetCallbackHandler(r), req = () => new Request(ASSET_CALLBACK_URL + '?state=' + state + '&code=fixture-code')
  const result = await callback(req()); equal(result.status, 303); equal(result.headers.get('location'), config.appUrl + '?velo_asset=connected'); equal(saved.length, 1)
  assert(!JSON.stringify(saved).includes('fixture-new-refresh')); assert(!JSON.stringify(saved).includes('fixture-new-access'))
  const decrypted = JSON.parse(await decryptToken(String(saved[0].encryptedGrant), config.tokenKey, `velo-asset-grant:${C}:${U}:canva`))
  equal(decrypted.refreshToken, canvaToken.refresh_token)
  equal((await callback(req())).headers.get('location'), config.appUrl + '?velo_asset=retry'); equal(saved.length, 1)
})
Deno.test('asset callback rejection, duplicates and revoked state do not call providers or accept a redirect target', async () => {
  let takes = 0
  const handler = createAssetCallbackHandler(runtime(op => { if (op === 'take') takes++; return Promise.resolve(null) }))
  for (const suffix of ['?state=' + 'a'.repeat(64) + '&code=x&code=y', '?state=' + 'a'.repeat(64) + '&redirect_uri=https://evil.example', '?state=' + 'a'.repeat(64) + '&code=x']) {
    const result = await handler(new Request(ASSET_CALLBACK_URL + suffix)); equal(result.headers.get('location'), config.appUrl + '?velo_asset=retry')
  }
  equal(takes, 1)
  const internal = await handler(new Request('http://edge-runtime:9000/velo-asset-callback?state=' + 'a'.repeat(64) + '&code=x', { headers: { 'X-Forwarded-Host': 'evil.example' } }))
  equal(internal.headers.get('location'), config.appUrl + '?velo_asset=retry'); equal(takes, 2)
  await handler(new Request('https://velo.example/wrong-path?state=' + 'a'.repeat(64))); equal(takes, 2)
})
Deno.test('asset refresh rotation survives metadata failure and a failed save never returns data or retries tokens', async () => {
  const encryptedGrant = await encryptToken(JSON.stringify(grant('canva', now - 1000)), config.tokenKey, `velo-asset-grant:${C}:${U}:canva`)
  const finishes: Record<string, unknown>[] = []; let calls = 0
  const r = runtime((op, _who, p) => { if (op === 'claim') return Promise.resolve({ id: C, generation: G, lease: L, encryptedGrant }); if (op === 'finish') { finishes.push(p); return Promise.resolve(true) } throw new Error() }, sequence([canvaToken, introspection, { error: 'metadata_failure' }], () => { calls++ }))
  await rejects(() => inspectConnectedAsset(r, config, owner, 'canva', 'design_fixture'), 'invalid_asset')
  equal(calls, 3); equal(finishes.length, 1)
  const saved = JSON.parse(await decryptToken(String(finishes[0].encryptedGrant), config.tokenKey, `velo-asset-grant:${C}:${U}:canva`))
  equal(saved.refreshToken, canvaToken.refresh_token)
  const noSave = runtime(op => Promise.resolve(op === 'claim' ? { id: C, generation: G, lease: L, encryptedGrant } : false), sequence([canvaToken, introspection, { design: { id: 'design_fixture', title: 'Test' } }]))
  await rejects(() => inspectConnectedAsset(noSave, config, owner, 'canva', 'design_fixture'), 'connection_required')
})
Deno.test('ambiguous asset refresh marks reconnect once and never reuses the stale token', async () => {
  const encryptedGrant = await encryptToken(JSON.stringify(grant('canva', now - 1000)), config.tokenKey, `velo-asset-grant:${C}:${U}:canva`)
  const finished: Record<string, unknown>[] = []; let calls = 0
  const r = runtime((op, _who, p) => { if (op === 'claim') return Promise.resolve({ id: C, generation: G, lease: L, encryptedGrant }); finished.push(p); return Promise.resolve(true) }, () => { calls++; return Promise.reject(new Error('Synthetic uncertain refresh')) })
  await rejects(() => inspectConnectedAsset(r, config, owner, 'canva', 'design_fixture'), 'connection_required')
  equal(calls, 1); equal(finished.length, 1); equal(finished[0].failed, true)
})
Deno.test('asset status strips internal fields and disconnect remains available with the read gate off', async () => {
  const ops: string[] = []
  const r = runtime(op => { ops.push(op); return Promise.resolve(op === 'list' ? { enabled: false, encryptedGrant: 'not-public', connections: [{ provider: 'drive', status: 'connected', accountName: 'Fixture', encryptedGrant: 'never-public', expiresAt: { secret: 'hidden' }, updatedAt: null }] } : true) }); r.config = () => ({ ...config, enabled: false })
  const handler = createAssetAccountHandler(r), result = await handler(request({ action: 'status' })), text = await result.text()
  assert(!text.includes('encryptedGrant')); assert(!text.includes('hidden')); assert(!text.includes('never-public')); equal(result.status, 200)
  equal((await handler(request({ action: 'disconnect', provider: 'drive' }))).status, 200); equal(ops, ['list', 'disconnect'])
})
Deno.test('fixed project transport rejects discovery/SQL/storage and preserves no-store/redirect policy', async () => {
  for (const path of ['/rest/v1/posts', '/storage/v1/object/list', '/rest/v1/rpc/execute_sql', '/auth/v1/admin/users']) await rejects(() => assetProjectFetch(ASSET_PROJECT_URL + path, {}, neverFetch), 'request_rejected')
  await rejects(() => assetProjectFetch('https://other.supabase.co/auth/v1/user', {}, neverFetch), 'request_rejected')
  await rejects(() => assetProjectFetch(ASSET_PROJECT_URL + '/auth/v1/user', { method: 'DELETE' }, neverFetch), 'request_rejected')
  const response = await assetProjectFetch(ASSET_PROJECT_URL + '/rest/v1/rpc/has_active_session', { method: 'POST' }, sequence([true], (_url, init) => { equal(init.redirect, 'error'); equal(init.credentials, 'omit') }))
  equal(await response.json(), true)
})
Deno.test('asset runtime authenticates before deriving session, cannot use client-supplied identity and rejects revoked Auth', async () => {
  const values: Record<string, string> = { SUPABASE_URL: ASSET_PROJECT_URL, AASIFLOW_ASSET_APP_URL: config.appUrl, AASIFLOW_ASSET_TOKEN_KEY: config.tokenKey, SUPABASE_ANON_KEY: 'fixture-public-key', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key' }
  const payload = btoa(JSON.stringify({ sub: U, session_id: S })).replace(/=/g, '')
  const req = new Request('https://velo.example', { headers: { Authorization: `Bearer e30.${payload}.fixture` } })
  const r = createAssetRuntime(name => values[name] ?? '', sequence([{ id: U, aud: 'authenticated', role: 'authenticated' }, true]))
  equal(await r.identify(req), owner)
  const revoked = createAssetRuntime(name => values[name] ?? '', sequence([{ id: U, aud: 'authenticated', role: 'authenticated' }, false]))
  await rejects(() => revoked.identify(req), 'request_rejected')
})
Deno.test('actual new asset entrypoints register without I/O and stay closed with no scoped setup', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve')!, get = Deno.env.get, originalFetch = globalThis.fetch
  const handlers: ((req: Request) => Promise<Response>)[] = []; let calls = 0
  try {
    Object.defineProperty(Deno, 'serve', { configurable: descriptor.configurable, enumerable: descriptor.enumerable, writable: true, value: (handler: (req: Request) => Promise<Response>) => handlers.push(handler) })
    Deno.env.get = () => undefined
    globalThis.fetch = () => { calls++; throw new Error('Unexpected outbound request') }
    await import('../supabase/functions/velo-asset-account/index.ts')
    await import('../supabase/functions/velo-asset-callback/index.ts')
    equal(handlers.length, 2)
    equal((await handlers[0](request({ action: 'start', provider: 'canva' }))).status, 503)
    equal((await handlers[1](new Request(ASSET_CALLBACK_URL + '?code=fixture&state=' + 'a'.repeat(64)))).status, 503)
    equal(calls, 0)
  } finally { Object.defineProperty(Deno, 'serve', descriptor); Deno.env.get = get; globalThis.fetch = originalFetch }
})
