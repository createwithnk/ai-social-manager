import type { Post } from '../../types'

export const connectorIds = ['instagram', 'tiktok', 'youtube-shorts', 'snapchat', 'google-business'] as const
export type ConnectorId = typeof connectorIds[number]
export interface Connector {
  id: ConnectorId
  name: string
  requirement: string
  steps: readonly string[]
  documentation: string
}
export const connectors: readonly Connector[] = [
  { id: 'instagram', name: 'Instagram', requirement: 'Professional account, OAuth permissions and reviewed media delivery.', steps: ['Validate approved snapshot', 'Create media container', 'Check processing status', 'Recheck approval and publish gate', 'Publish once and save receipt'], documentation: 'https://developers.facebook.com/docs/instagram-platform/content-publishing/' },
  { id: 'tiktok', name: 'TikTok', requirement: 'Creator consent, video.publish access and API audit for public posting.', steps: ['Read creator choices', 'Capture explicit consent', 'Upload approved video', 'Check processing status', 'Save publication receipt'], documentation: 'https://developers.tiktok.com/doc/content-posting-api-get-started/' },
  { id: 'youtube-shorts', name: 'YouTube Shorts', requirement: 'Channel authorization, eligible video and explicitly private first upload.', steps: ['Validate approved video', 'Start resumable upload with private visibility', 'Check processing status', 'Review private upload', 'Keep public release separately gated'], documentation: 'https://developers.google.com/youtube/v3/docs/videos/insert' },
  { id: 'snapchat', name: 'Snapchat', requirement: 'Approved Public Profile API access and business OAuth authorization.', steps: ['Verify authorized Public Profile', 'Upload approved media', 'Check processing status', 'Recheck approval and publish gate', 'Create content and save receipt'], documentation: 'https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted' },
  { id: 'google-business', name: 'Google Business Profile', requirement: 'Approved API access and an authorized eligible verified business location.', steps: ['Verify authorized location', 'Validate local post content', 'Recheck approval and publish gate', 'Create local post once', 'Save publication receipt'], documentation: 'https://developers.google.com/my-business/content/posts-data' },
]
export interface PublishingPreview {
  mode: 'preview-only'
  connectorId: ConnectorId
  contentDigest: string
  blockers: string[]
  steps: readonly string[]
  queued: false
  published: false
}
// A digest detects content changes; it is NOT an approval token or server permission.
export async function postDigest(post: Post): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    id: post.id, revision: post.revision ?? null, platform: post.platform, status: post.status,
    idea: post.idea, caption: post.caption, hashtags: post.hashtags, tone: post.tone,
    language: post.language ?? 'en', market: post.market ?? 'General',
    scheduledFor: post.scheduledFor ?? null, media: post.media ?? null,
  }))
  if (bytes.length > 100_000) throw new Error('Choose a smaller saved post for this preview.')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}
export async function previewPublication(post: Post, connectorId: ConnectorId): Promise<PublishingPreview> {
  const connector = connectors.find(item => item.id === connectorId)
  if (!connector) throw new Error('Choose a supported connector.')
  const blockers = ['Live publishing is disabled.', 'A verified account connection and server review are required.']
  if (!['approved', 'scheduled'].includes(post.status)) blockers.push('Review and approve this saved post first.')
  if (post.platform !== connector.name) blockers.push('This post must be reviewed for the selected platform before integration.')
  if (connectorId !== 'google-business' && !post.media) blockers.push('An approved image or video is required.')
  if (['tiktok', 'youtube-shorts', 'snapchat'].includes(connectorId) && post.media?.type !== 'video/mp4') blockers.push('An approved MP4 video is required.')
  if (post.media && (!post.media.path || post.media.path.includes('://'))) blockers.push('External bookmarks must be imported and reviewed before publishing.')
  return { mode: 'preview-only', connectorId, contentDigest: await postDigest(post), blockers, steps: connector.steps, queued: false, published: false }
}
export async function previewStillMatches(preview: PublishingPreview, current: Post): Promise<boolean> {
  return preview.contentDigest === await postDigest(current)
}
