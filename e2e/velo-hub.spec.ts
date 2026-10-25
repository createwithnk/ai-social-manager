import { expect, test } from '@playwright/test'
test.beforeEach(async ({ page }) => {
 await page.route('**/*', route => {
  const url = new URL(route.request().url())
  if (url.hostname !== '127.0.0.1') return route.abort()
  if (url.pathname === '/velo-hub-fixture') return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/e2e/fixtures/velo-hub-harness.tsx');</script></body></html>`})
  return route.continue()
 })
})
test('workspace hub lists and opens all four isolated modules with unique selectors', async ({page})=>{
 await page.goto('/velo-hub-fixture')
 const hub=page.getByTestId('velo-workspace-hub')
 await expect(hub).toBeVisible()
 for(const id of ['drive-import','canva-bridge','social-publishing','whatsapp-lead-agent']){
  const card=hub.getByTestId(`velo-hub-card-${id}`)
  await expect(card).toHaveCount(1)
  await expect(card).toBeVisible()
  await hub.getByTestId(`velo-hub-open-${id}`).click()
  await expect(hub.getByTestId('velo-hub-active-panel')).toBeVisible()
  await expect(hub.getByTestId('velo-hub-back')).toHaveCount(1)
  await hub.getByTestId('velo-hub-back').click()
  await expect(hub.getByTestId(`velo-hub-card-${id}`)).toBeVisible()
 }
})
test('Arabic RTL hub fits a mobile viewport and locale can be switched',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto('/velo-hub-fixture?lang=ar')
 const hub=page.getByTestId('velo-workspace-hub')
 await expect(hub).toHaveAttribute('dir','rtl')
 await expect(hub).toHaveAttribute('lang','ar')
 await expect(hub.getByTestId('velo-hub-card-drive-import')).toHaveCount(1)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await hub.getByTestId('velo-hub-language').click()
 await expect(hub).toHaveAttribute('lang','en')
})
test('provider modules remain gated unless the host explicitly configures them',async({page})=>{
 await page.goto('/velo-hub-fixture')
 const hub=page.getByTestId('velo-workspace-hub')
 await hub.getByTestId('velo-hub-open-drive-import').click()
 await expect(hub.getByText('Configure the Google Web client, restricted Picker browser key and project number first.',{exact:true})).toBeVisible()
 await hub.getByTestId('velo-hub-back').click()
 await hub.getByTestId('velo-hub-open-canva-bridge').click()
 await expect(hub.getByText('Optional module is off. No account request or browser record was opened.',{exact:true})).toBeVisible()
})
