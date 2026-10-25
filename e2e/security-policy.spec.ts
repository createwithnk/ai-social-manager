import fs from 'node:fs'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

const headers: Record<string, string> = JSON.parse(fs.readFileSync('deployment/security-headers.json', 'utf8'))
const target = JSON.parse(fs.readFileSync('deployment/target.json', 'utf8')) as { supabaseOrigin: string }

test('prepared CSP actually blocks inline scripts and embedded frames', async ({ page }) => {
  const forbiddenRequests: string[] = []
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' && url.pathname === '/__policy') {
      return route.fulfill({ headers, contentType: 'text/html', body: '<!doctype html><html><body><h1>Local policy fixture</h1><script>window.inlineExecuted=true</script><iframe src="/__frame"></iframe></body></html>' })
    }
    forbiddenRequests.push(url.pathname)
    return route.abort()
  })
  await page.goto('/__policy')
  await expect(page.getByRole('heading', { name: 'Local policy fixture' })).toBeVisible()
  expect(await page.evaluate(() => 'inlineExecuted' in window)).toBe(false)
  expect(forbiddenRequests).not.toContain('/__frame')
})

test('prepared CSP permits mocked private previews and blocks other image hosts', async ({ page }) => {
  let privatePreviewRequested = false
  let foreignPreviewRequested = false
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.fulfill({ headers, contentType: 'text/html', body: `<!doctype html><html><body><img id="private" src="${target.supabaseOrigin}/fixture.png"><img src="https://untrusted.invalid/fixture.png"></body></html>` })
    if (url.origin === target.supabaseOrigin) {
      privatePreviewRequested = true
      // Synthetic one-pixel fixture; requests are fulfilled locally, never sent to Supabase.
      return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') })
    }
    foreignPreviewRequested = true
    return route.abort()
  })
  await page.goto('/__policy')
  await expect.poll(() => page.locator('#private').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1)
  expect(privatePreviewRequested).toBe(true)
  expect(foreignPreviewRequested).toBe(false)
})
