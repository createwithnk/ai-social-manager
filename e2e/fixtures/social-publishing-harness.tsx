import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import SocialPublishingDashboard from '../../src/features/social-publishing/SocialPublishingDashboard'
import type { SocialPublishingApi, SocialPublishingSnapshot, SocialPlatform } from '../../src/features/social-publishing/types.ts'
const initial: SocialPublishingSnapshot = {
  enabled: true,
  connections: [
    { platform: 'instagram', status: 'connected', accountLabel: 'Demo Instagram' },
    { platform: 'tiktok', status: 'not-configured' },
    { platform: 'youtube-shorts', status: 'disconnected' },
    { platform: 'snapchat', status: 'reauthorization-required' },
    { platform: 'google-business', status: 'error', message: 'Synthetic connection issue' },
  ],
  queue: [
    { id: 'scheduled_1', platform: 'instagram', caption: 'Launch preview', scheduledAt: '2027-01-01T09:00:00Z', status: 'scheduled' },
    { id: 'publishing_1', platform: 'tiktok', caption: 'Video preview', scheduledAt: '2027-01-02T09:00:00Z', status: 'publishing' },
    { id: 'failed_1', platform: 'google-business', caption: 'Location update', scheduledAt: '2027-01-03T09:00:00Z', status: 'failed', error: 'Synthetic failure' },
  ],
}
function fixtureApi(): SocialPublishingApi {
  const data = structuredClone(initial)
  return {
    load: async () => { document.body.dataset.loads = String(Number(document.body.dataset.loads ?? '0') + 1); return structuredClone(data) },
    connect: async (platform: SocialPlatform) => { if (platform === 'tiktok') throw new Error('private fixture error'); data.connections = data.connections.map(item => item.platform === platform ? { ...item, status: 'connected' as const } : item) },
    cancel: async (id: string) => { if (id === 'failed_1') throw new Error('private fixture error'); data.queue = data.queue.map(item => item.id === id ? { ...item, status: 'cancelled' as const } : item) },
  }
}
export default function Harness() {
  const [locale, setLocale] = useState<'en'|'ar'>(new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en')
  const [enabled, setEnabled] = useState(new URLSearchParams(location.search).get('mode') !== 'disabled')
  const api = useMemo(() => fixtureApi(), [])
  return <main style={{ padding: 12, fontFamily: 'sans-serif' }}>
    <button onClick={() => setLocale(value => value === 'en' ? 'ar' : 'en')}>Toggle language</button>
    <button onClick={() => setEnabled(value => !value)}>Toggle enabled</button>
    <SocialPublishingDashboard enabled={enabled} locale={locale} api={api} confirmCancel={() => true} />
  </main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
