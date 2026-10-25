import { expect, test } from '@playwright/test'

test('owner dashboard denies unconfigured access without exposing metrics', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await page.goto('/')
  // Mount the actual component in the local preview without fabricating an owner role.
  await page.evaluate(async () => {
    const componentPath = '/src/AdminDashboard.tsx'
    const reactPath = '/node_modules/.vite/deps/react.js'
    const domPath = '/node_modules/.vite/deps/react-dom_client.js'
    const [{ default: Dashboard }, { default: React }, { default: ReactDOM }] = await Promise.all([import(componentPath), import(reactPath), import(domPath)])
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    ReactDOM.createRoot(host).render(React.createElement(Dashboard))
  })
  await expect(page.getByRole('alert')).toContainText('Monitoring unavailable')
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByRole('alert')).toContainText('Monitoring unavailable')
  await expect(page.getByText('Security alerts')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
