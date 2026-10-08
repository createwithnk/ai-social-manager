const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

// Execute the real entrypoint and media helper. All Auth, RPC, Storage and
// provider HTTP use intercepted fixtures; no network, payments or publishing.
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const signatureExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/media-signature.ts', 'utf8'), { compilerOptions }).outputText, { exports: signatureExports });
let handler, providerCalls, quotaCalls, downloadCalls, clientOptions, providerRequest;
let authenticated, active, sessionError, quota, quotaError, downloadError, mediaFile, providerStatus, providerDraft, providerFailure;
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-placeholder', GEMINI_API_KEY: 'test-only', GEMINI_MODEL: 'test-model', ALLOWED_ORIGINS: 'https://app.example' };
const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const client = {
  auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user-a' } : null }, error: null }) },
  rpc: async name => {
    if (name === 'has_active_session') return { data: active, error: sessionError };
    assert.equal(name, 'consume_ai_quota'); quotaCalls++;
    return { data: quota, error: quotaError };
  },
  storage: { from: bucket => {
    assert.equal(bucket, 'post-media');
    return { download: async path => {
      downloadCalls++; assert.equal(path, 'user-a/photo.png');
      return { data: mediaFile, error: downloadError };
    } };
  } },
};
const source = fs.readFileSync('supabase/functions/generate-content/index.ts', 'utf8').replace(/^import .*\n/gm, '');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, {
  Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
  createClient: (_url, _key, options) => { clientOptions = options; return client; },
  mediaSignatureMatches: signatureExports.mediaSignatureMatches,
  Response, Request, TextDecoder, AbortSignal, Uint8Array, btoa,
  fetch: async (url, options) => {
    providerCalls++; providerRequest = { url, options };
    if (providerFailure) throw new Error('Simulated provider timeout; must not appear in the response.');
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerDraft) }] } }] }, { status: providerStatus });
  },
});
const brief = { idea: 'A useful small business idea', platform: 'Instagram', tone: 'Friendly', language: 'English' };
const mediaBrief = { ...brief, media: { path: 'user-a/photo.png', type: 'image/png' } };
const request = (body = brief, headers = {}) => new Request('https://edge.example', { method: 'POST', headers: { authorization: 'Bearer example', origin: 'https://app.example', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
function reset() {
  providerCalls = 0; quotaCalls = 0; downloadCalls = 0; clientOptions = null; providerRequest = null;
  authenticated = true; active = true; quota = true;
  sessionError = null; quotaError = null; downloadError = null;
  mediaFile = new Blob([pngHeader], { type: 'image/png' });
  providerStatus = 200; providerDraft = { caption: 'A draft', hashtags: ['Example'] }; providerFailure = false;
}
function untouched() { assert.equal(providerCalls, 0); assert.equal(quotaCalls, 0); assert.equal(downloadCalls, 0); }

test('AI entrypoint security and request flow (intercepted HTTP)', async t => {
  const check = (name, fn) => t.test(name, async () => { reset(); await fn(); });
  await check('missing authorization is denied before Auth/quota/provider calls', async () => {
    assert.equal((await handler(request(brief, { authorization: '' }))).status, 401); untouched(); assert.equal(clientOptions, null);
  });
  await check('invalid user cannot consume quota or call the provider', async () => {
    authenticated = false; assert.equal((await handler(request())).status, 401); untouched();
  });
  await check('deleted or ended Auth session is rejected before quota/provider calls', async () => {
    active = false; assert.equal((await handler(request())).status, 401); untouched();
  });
  await check('session RPC failure fails closed', async () => {
    sessionError = { message: 'Unavailable session RPC' }; assert.equal((await handler(request())).status, 503); untouched();
  });
  await check('unapproved browser origin is rejected before authentication', async () => {
    assert.equal((await handler(request(brief, { origin: 'https://evil.example' }))).status, 403); untouched(); assert.equal(clientOptions, null);
  });
  await check('short input is rejected before quota/provider calls', async () => {
    assert.equal((await handler(request({ ...brief, idea: 'short' }))).status, 400); untouched();
  });
  await check('foreign-owner attachment is rejected without download', async () => {
    assert.equal((await handler(request({ ...brief, media: { path: 'user-b/private', type: 'image/png' } }))).status, 400); untouched();
  });
  await check('oversize streamed input is rejected without Content-Length', async () => {
    assert.equal((await handler(request({ ...brief, idea: 'x'.repeat(9000) }))).status, 413); untouched();
  });
  await check('quota rejection never reaches the provider', async () => {
    quota = false; assert.equal((await handler(request())).status, 429); assert.equal(providerCalls, 0); assert.equal(quotaCalls, 1);
  });
  await check('quota RPC failure fails closed', async () => {
    quotaError = { message: 'Unavailable quota RPC' }; assert.equal((await handler(request())).status, 503); assert.equal(providerCalls, 0);
  });
  await check('valid draft uses server Auth settings and rejects HTTP redirects', async () => {
    const response = await handler(request()); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { caption: 'A draft', hashtags: ['Example'] });
    assert.equal(providerCalls, 1); assert.equal(quotaCalls, 1); assert.equal(clientOptions.auth.persistSession, false); assert.equal(clientOptions.auth.autoRefreshToken, false);
    assert.equal(providerRequest.url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
    assert.equal(providerRequest.options.redirect, 'error'); assert.equal(providerRequest.options.method, 'POST'); assert.ok(providerRequest.options.signal);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
  await check('declared PNG with invalid bytes is rejected before provider call', async () => {
    mediaFile = new Blob(['not a PNG'], { type: 'image/png' }); assert.equal((await handler(request(mediaBrief))).status, 400);
    assert.equal(downloadCalls, 1); assert.equal(quotaCalls, 1); assert.equal(providerCalls, 0);
  });
  await check('downloaded MIME different from the declared MIME is rejected', async () => {
    mediaFile = new Blob([pngHeader], { type: 'image/jpeg' }); assert.equal((await handler(request(mediaBrief))).status, 400); assert.equal(providerCalls, 0);
  });
  await check('private media read failure prevents provider transmission', async () => {
    downloadError = { message: 'Inaccessible storage' }; assert.equal((await handler(request(mediaBrief))).status, 400); assert.equal(providerCalls, 0);
  });
  await check('private media above 10 MB prevents provider transmission', async () => {
    mediaFile = new Blob([new Uint8Array(10485761)], { type: 'image/png' }); assert.equal((await handler(request(mediaBrief))).status, 400); assert.equal(providerCalls, 0);
  });
  await check('matching owner, MIME and container prefix pass bytes to intercepted provider', async () => {
    const response = await handler(request(mediaBrief)); assert.equal(response.status, 200); assert.equal(providerCalls, 1); assert.equal(downloadCalls, 1);
    const payload = JSON.parse(providerRequest.options.body); const attachment = payload.contents[0].parts[1].inlineData;
    assert.equal(attachment.mimeType, 'image/png'); assert.equal(attachment.data, Buffer.from(pngHeader).toString('base64'));
  });
  await check('caption plus hashtags outside the selected platform limit are rejected', async () => {
    providerDraft.caption = 'x'.repeat(2200); assert.equal((await handler(request())).status, 502); assert.equal(providerCalls, 1);
  });
  await check('malformed provider hashtag is rejected', async () => {
    providerDraft.hashtags = ['bad<tag>']; assert.equal((await handler(request())).status, 502);
  });
  await check('valid Hindi/Arabic hashtags and initial # are normalized', async () => {
    providerDraft.hashtags = ['#नौशाद', 'التسويق']; const response = await handler(request()); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).hashtags, ['नौशाद', 'التسويق']);
  });
  await check('provider rate limit produces one failed attempt without automatic retry', async () => {
    providerStatus = 429; assert.equal((await handler(request())).status, 429); assert.equal(providerCalls, 1); assert.equal(quotaCalls, 1);
  });
  await check('provider timeout produces a safe error without automatic retry', async () => {
    providerFailure = true; const response = await handler(request()); assert.equal(response.status, 500); assert.equal(providerCalls, 1); assert.equal(quotaCalls, 1);
    assert.deepEqual(await response.json(), { error: 'Generation failed or timed out. Please retry.' });
  });
});
