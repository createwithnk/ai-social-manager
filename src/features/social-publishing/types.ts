export const socialPlatforms = ['instagram', 'tiktok', 'youtube-shorts', 'snapchat', 'google-business'] as const
export type SocialPlatform = typeof socialPlatforms[number]
export type SocialConnectionState = 'connected' | 'disconnected' | 'reauthorization-required' | 'not-configured' | 'error'
export type SocialQueueState = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
export interface SocialConnection { platform: SocialPlatform; status: SocialConnectionState; accountLabel?: string; checkedAt?: string; message?: string }
export interface SocialQueueItem { id: string; platform: SocialPlatform; caption: string; scheduledAt: string; status: SocialQueueState; error?: string }
export interface SocialPublishingSnapshot { enabled: boolean; connections: SocialConnection[]; queue: SocialQueueItem[] }
export interface SocialPublishingApi {
  load(): Promise<SocialPublishingSnapshot>
  connect(platform: SocialPlatform): Promise<void>
  cancel(postId: string): Promise<void>
}
export type SocialLocale = 'en' | 'ar'
