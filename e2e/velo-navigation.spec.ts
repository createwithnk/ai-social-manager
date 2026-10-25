import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Exercise the real application shell without reaching external services.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await page.goto('/')
})

test('main navigation mounts Velo Hub and opens each module without changing approval flow', async ({ page }) => {
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  const hubNav = page.getByRole('button', { name: 'Velo Hub', exact: true })
  await expect(hubNav).toBeVisible()
  await hubNav.click()
  await expect(page.getByRole('heading', { name: 'Velo Workspace Hub', exact: true })).toBeFocused()
  await expect(page.locator('.app-shell > main > header').getByText('VELO WORKSPACE', { exact: true })).toBeVisible()
  const hub = page.getByTestId('velo-workspace-hub')
  await expect(hub).toBeVisible()

  for (const id of ['drive-import', 'canva-bridge', 'social-publishing', 'whatsapp-lead-agent']) {
    await expect(hub.getByTestId(`velo-hub-card-${id}`)).toBeVisible()
    await hub.getByTestId(`velo-hub-open-${id}`).click()
    await expect(hub.getByTestId('velo-hub-active-panel')).toBeVisible()
    await hub.getByTestId('velo-hub-back').click()
  }

  await expect(hub.getByTestId('velo-hub-card-drive-import')).toBeVisible()
  await expect(page.getByText('Nothing is published without your approval.', { exact: true })).toHaveCount(1)
})
