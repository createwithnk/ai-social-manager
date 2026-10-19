import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 30000,
  reporter: 'line', outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    channel: process.env.AASIFLOW_TEST_BROWSER ? undefined : process.platform === 'win32' ? 'msedge' : undefined,
    launchOptions: process.env.AASIFLOW_TEST_BROWSER ? { executablePath: process.env.AASIFLOW_TEST_BROWSER } : undefined,
    headless: true,
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://your-project.supabase.co', VITE_SUPABASE_ANON_KEY: 'your-anon-key' },
    timeout: 60000,
  },
})
