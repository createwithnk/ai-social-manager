import { expect, test, type Page } from '@playwright/test'

const sample = { id: 'asset-synthetic-post', idea: 'Existing post', caption: 'Keep my caption', hashtags: [], platform: 'Instagram', tone: 'Friendly', status: 'approved', revision: 2, createdAt: '2026-10-01T00:00:00Z' }
async function tools(page: Page, arabic = false) {
  const menu = page.getByRole('button', { name: arabic ? 'فتح القائمة' : 'Open navigation', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: arabic ? 'أدوات Velo' : 'Velo tools', exact: true }).click()
}
test.beforeEach(async ({ page }) => {
  // Override only the new module's transport. Real core code still runs unchanged;
  // every non-local request is blocked, including all OAuth/provider destinations.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') return route.abort()
    if (url.pathname === '/src/features/assets/connection-client.ts') return route.fulfill({ contentType: 'application/javascript', body: `
      import { createAssetConnectionApi } from '/src/features/assets/connections.ts';
      export const assetConnectionsEnabled = true;
      globalThis.__assetFixtureCalls = [];
      let connected = true;
      export const assetConnectionApi = createAssetConnectionApi(async body => {
        globalThis.__assetFixtureCalls.push(body);
        if (body.action === 'status') return {enabled:true,configured:{canva:true,drive:true},connections:[{provider:'canva',status:connected?'connected':'disconnected',accountName:connected?'Fixture owner':null}]};
        if (body.action === 'start') {
          await new Promise(resolve => setTimeout(resolve, 80));
          if (body.provider === 'drive') throw new Error('provider-secret-sentinel');
          const url = new URL('https://www.canva.com/api/oauth/authorize');
          url.search = new URLSearchParams({client_id:'fixture_client',response_type:'code',redirect_uri:'https://nkfecpdegcmsapvbviky.supabase.co/functions/v1/velo-asset-callback',scope:'design:meta:read',state:'a'.repeat(64),code_challenge:'b'.repeat(43),code_challenge_method:'S256'}).toString();
          return {authorizationUrl:url.toString()};
        }
        if (body.action === 'disconnect') {connected=false;return {disconnected:true,provider:body.provider};}
        return {asset:{provider:body.provider,id:body.assetId,title:'Verified fixture design',mimeType:null,bytes:null,canDownload:null}};
      });` })
    return route.continue()
  })
  await page.goto('/')
  await page.evaluate(post => localStorage.setItem('aasiflow-posts', JSON.stringify([post])), sample)
  await page.reload()
})
test('mobile-safe asset consent, metadata and disconnect leave core posts and files unchanged', async ({ page }) => {
  await tools(page)
  await expect(page.getByRole('heading', { name: 'Connected asset accounts' })).toBeVisible()
  await page.getByRole('button', { name: 'Connect: Canva', exact: true }).click()
  const consent = page.getByRole('link', { name: 'Continue to provider consent: Canva', exact: true })
  await expect(consent).toHaveAttribute('href', /^https:\/\/www\.canva\.com\/api\/oauth\/authorize\?/)
  await page.getByLabel('Authorized design or file link', { exact: true }).fill('https://www.canva.com/design/design_fixture/view')
  await page.getByRole('button', { name: 'Check file metadata', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Metadata verified. Nothing was imported or changed.')
  await page.getByRole('button', { name: 'Disconnect: Canva', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Velo credentials removed.')
  await expect(page.getByRole('button', { name: 'Disconnect: Canva', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aasiflow-posts') ?? '[]'))).toEqual([sample])
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /token|grant|connection/.test(key)))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
test('failed account consent and invalid links show sanitized errors without duplicate starts', async ({ page }) => {
  await tools(page)
  const start = page.getByRole('button', { name: 'Connect: Google Drive', exact: true })
  await start.click()
  await expect(start).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveText('Asset accounts are unavailable. No files were changed.')
  await expect(page.locator('body')).not.toContainText('provider-secret-sentinel')
  await page.getByLabel('Authorized design or file link', { exact: true }).fill('https://evil.example/file_fixture')
  await page.getByRole('button', { name: 'Check file metadata', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Choose a Canva design or a Google Drive file link.')
  const calls = await page.evaluate(() => (globalThis as unknown as { __assetFixtureCalls: { action: string }[] }).__assetFixtureCalls)
  expect(calls.filter(item => item.action === 'start')).toHaveLength(1)
  expect(calls.filter(item => item.action === 'inspect')).toHaveLength(0)
})
test('Arabic account controls remain labelled, responsive and separate from publishing', async ({ page }) => {
  await page.getByLabel('Interface language').selectOption('ar')
  await tools(page, true)
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'حسابات الأصول المتصلة' })).toBeVisible()
  await page.getByRole('button', { name: 'اتصال: Canva', exact: true }).click()
  await expect(page.getByRole('link', { name: 'المتابعة إلى موافقة المزوّد: Canva', exact: true })).toBeVisible()
  await page.getByLabel('رابط تصميم أو ملف مفوّض', { exact: true }).fill('https://www.canva.com/design/design_fixture/view')
  await page.getByRole('button', { name: 'فحص بيانات الملف الوصفية', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('تم التحقق من البيانات الوصفية دون استيراد أو تعديل أي شيء.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/velo-asset-connection-arabic-' + test.info().project.name + '.png', fullPage: true })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aasiflow-posts') ?? '[]'))).toEqual([sample])
})
