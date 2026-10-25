import { socialPlatforms, type SocialPlatform, type SocialPublishingSnapshot } from './types.ts'
export class SocialPublishingError extends Error { constructor(message: string) { super(message); this.name = 'SocialPublishingError' } }
export function validateSnapshot(value: unknown): SocialPublishingSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SocialPublishingError('Invalid social publishing response.')
  const data = value as Record<string, unknown>
  if (typeof data.enabled !== 'boolean' || !Array.isArray(data.connections) || !Array.isArray(data.queue) || data.connections.length > 5 || data.queue.length > 500) throw new SocialPublishingError('Invalid social publishing response.')
  const connections = data.connections.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new SocialPublishingError('Invalid connection entry.')
    const item = entry as Record<string, unknown>
    if (!socialPlatforms.includes(item.platform as SocialPlatform) || !['connected','disconnected','reauthorization-required','not-configured','error'].includes(String(item.status))) throw new SocialPublishingError('Invalid connection entry.')
    if (item.accountLabel !== undefined && (typeof item.accountLabel !== 'string' || item.accountLabel.length > 200)) throw new SocialPublishingError('Invalid account label.')
    if (item.message !== undefined && (typeof item.message !== 'string' || item.message.length > 500)) throw new SocialPublishingError('Invalid status message.')
    return { platform: item.platform as SocialPlatform, status: item.status as SocialPublishingSnapshot['connections'][number]['status'], ...(typeof item.accountLabel === 'string' ? { accountLabel: item.accountLabel } : {}), ...(typeof item.checkedAt === 'string' ? { checkedAt: item.checkedAt } : {}), ...(typeof item.message === 'string' ? { message: item.message } : {}) }
  })
  const seen = new Set<string>()
  if (connections.some(item => seen.has(item.platform) || !seen.add(item.platform))) throw new SocialPublishingError('Duplicate platform connection.')
  const queue = data.queue.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new SocialPublishingError('Invalid queue entry.')
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.id) || !socialPlatforms.includes(item.platform as SocialPlatform) || typeof item.caption !== 'string' || item.caption.length > 5000 || typeof item.scheduledAt !== 'string' || !Number.isFinite(Date.parse(item.scheduledAt)) || !['scheduled','publishing','published','failed','cancelled'].includes(String(item.status))) throw new SocialPublishingError('Invalid queue entry.')
    if (item.error !== undefined && (typeof item.error !== 'string' || item.error.length > 500)) throw new SocialPublishingError('Invalid queue error.')
    return { id: item.id, platform: item.platform as SocialPlatform, caption: item.caption, scheduledAt: item.scheduledAt, status: item.status as SocialPublishingSnapshot['queue'][number]['status'], ...(typeof item.error === 'string' ? { error: item.error } : {}) }
  })
  return { enabled: data.enabled, connections, queue }
}
export function canCancelStatus(status: SocialPublishingSnapshot['queue'][number]['status']) { return status === 'scheduled' || status === 'failed' }
export function isSupportedPlatform(value: string): value is SocialPlatform { return socialPlatforms.includes(value as SocialPlatform) }
