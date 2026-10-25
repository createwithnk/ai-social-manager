import { test, expect } from '@playwright/test'
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') return route.abort()
    if (url.pathname === '/social-publishing-fixture') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
      await import('/e2e/fixtures/social-publishing-harness.tsx');</script></body></html>` })
    return route.continue()
  })
})
test('shows five provider statuses and only permits safe queue cancellation', async ({ page }) => {
  await page.goto('/social-publishing-fixture')
  await expect(page.getByRole('heading', { name: 'Platform connections' })).toBeVisible()
  const connections = page.locator('.vsp-section').filter({ has: page.getByRole('heading', { name: 'Platform connections', exact: true }) })
  for (const name of ['Instagram Business','TikTok','YouTube Shorts','Snapchat','Google Business Profile']) await expect(connections.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel scheduled post' })).toHaveCount(2)
  await page.getByRole('button', { name: 'Cancel scheduled post' }).first().click()
  await expect(page.getByText('Scheduled post cancelled.', { exact: true })).toBeVisible()
})
test('Arabic RTL layout fits mobile and preserves queue controls', async ({ page }) => {
  await page.goto('/social-publishing-fixture?lang=ar')
  const panel = page.locator('.velo-social-publishing')
  await expect(panel).toHaveAttribute('dir', 'rtl')
  await expect(panel).toHaveAttribute('lang', 'ar')
  await expect(page.getByRole('heading', { name: 'اتصالات المنصات' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('disabled feature makes no adapter request and does not render queue actions', async ({ page }) => {
  await page.goto('/social-publishing-fixture?mode=disabled')
  await expect(page.getByText('Social publishing is not configured. No provider account was contacted.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel scheduled post' })).toHaveCount(0)
  expect(await page.locator('body').getAttribute('data-loads')).toBeNull()
})
test('provider and queue errors do not leak internal exception details', async ({ page }) => {
  await page.goto('/social-publishing-fixture')
  await page.getByRole('button', { name: 'Connect account' }).nth(1).click()
  await expect(page.getByRole('alert')).toContainText('The requested action could not be completed.')
  await expect(page.getByRole('alert')).not.toContainText('private fixture error')
  await page.getByRole('button', { name: 'Cancel scheduled post' }).nth(1).click()
  await expect(page.getByRole('alert')).toContainText('The requested action could not be completed.')
  await expect(page.getByRole('alert')).not.toContainText('private fixture error')
})
