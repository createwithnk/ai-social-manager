import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') return route.abort()
    if (url.pathname === '/drive-import-fixture') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
      await import('/e2e/fixtures/drive-import-harness.tsx');
    </script></body></html>` })
    return route.continue()
  })
})
async function choose(page: Page, arabic = false) {
  await page.getByRole('button', { name: arabic ? 'تجهيز منتقي Google' : 'Prepare Google Picker', exact: true }).click()
  await page.getByRole('button', { name: arabic ? 'تصفّح Google Drive' : 'Browse Google Drive', exact: true }).click()
  await expect(page.getByText('منتج تجريبي.png', { exact: true })).toBeVisible()
}
test('isolated Drive UI imports explicitly, deduplicates reselection and resets on owner change', async ({ page }) => {
  await page.goto('/drive-import-fixture')
  await page.evaluate(() => localStorage.setItem('aasiflow-posts', 'preserved-fixture'))
  await choose(page)
  await expect(page.locator('body')).not.toHaveAttribute('data-uploads')
  await page.getByRole('button', { name: 'Import selected files', exact: true }).click()
  await expect(page.getByText(/^Imported privately/).first()).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-uploads', '1')
  await page.getByRole('button', { name: 'Browse Google Drive', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Import selected files', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Switch test owner', exact: true }).click()
  await expect(page.getByText('No files selected.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('aasiflow-posts'))).toBe('preserved-fixture')
})
test('actual Velo Beta gate keeps Drive import disabled without changing the core', async ({ page }) => {
  await page.goto('/drive-import-fixture?mode=default-paused')
  await choose(page)
  await expect(page.getByText(/^Velo uploads are paused/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import selected files', exact: true })).toBeDisabled()
  await expect(page.locator('body')).not.toHaveAttribute('data-uploads')
})
test('changed files cannot reach uploads and uncertain writes cannot be automatically retried', async ({ page }) => {
  await page.goto('/drive-import-fixture?mode=changed'); await choose(page)
  await page.getByRole('button', { name: 'Import selected files', exact: true }).click()
  await expect(page.getByText('A Drive file changed after selection. Select its latest version again.', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toHaveAttribute('data-uploads')
  await page.goto('/drive-import-fixture?mode=uncertain'); await choose(page)
  await page.getByRole('button', { name: 'Import selected files', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('An upload result is unconfirmed.')
  await expect(page.getByRole('button', { name: 'Import selected files', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Browse Google Drive', exact: true })).toBeDisabled()
  await expect(page.locator('body')).not.toContainText('private-storage-sentinel')
  await expect(page.locator('body')).toHaveAttribute('data-uploads', '1')
})
test('Arabic importer is labelled, responsive and clears state when closed', async ({ page }) => {
  await page.goto('/drive-import-fixture?lang=ar'); await choose(page, true)
  await expect(page.getByRole('region', { name: 'استيراد من Google Drive', exact: true })).toHaveAttribute('dir', 'rtl')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Toggle panel', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle panel', exact: true }).click()
  await expect(page.getByText('لم تُحدّد ملفات.', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/drive-import-arabic-' + test.info().project.name + '.png', fullPage: true })
})
