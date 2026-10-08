import type { Post } from '../types'
export const captionLimits = { Instagram: 2200, LinkedIn: 3000, Facebook: 63206, X: 280 }
export function validatePost(post: Post, now = Date.now()) {
  if (!post || typeof post !== 'object' || typeof post.idea !== 'string' || typeof post.caption !== 'string' || !Object.hasOwn(captionLimits,post.platform) || !['draft','approved','scheduled'].includes(post.status) || !['Friendly','Professional','Bold','Educational'].includes(post.tone) || !['English','Hindi','Urdu','Arabic'].includes(post.language ?? 'English')) throw new Error('Check the post platform, tone, language and status.')
  if (!Array.isArray(post.hashtags) || post.hashtags.length > 8 || !post.hashtags.every(tag => typeof tag === 'string' && /^[\p{L}\p{M}\p{N}_]{1,80}$/u.test(tag))) throw new Error('Use up to 8 hashtags with letters, numbers or underscores.')
  if (!post.idea.trim() || post.idea.length > 500) throw new Error('Add an idea of up to 500 characters.')
  if (!post.caption.trim()) throw new Error('Caption cannot be empty.')
  const text = `${post.caption}\n\n${post.hashtags.map(t => `#${t}`).join(' ')}`.trim()
  if ([...text].length > captionLimits[post.platform]) throw new Error(`Caption and hashtags exceed the ${captionLimits[post.platform]} character limit.`)
  if (post.status === 'scheduled' && (!post.scheduledFor || !Number.isFinite(Date.parse(post.scheduledFor)) || Date.parse(post.scheduledFor) <= now)) throw new Error('Choose a future date and time.')
  if (post.status !== 'scheduled' && post.scheduledFor) throw new Error('Only scheduled posts can have a schedule.')
  if (post.media && (typeof post.media.path !== 'string' || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,151}$/i.test(post.media.path) || typeof post.media.name !== 'string' || post.media.name.length > 200 || !Number.isSafeInteger(post.media.size) || post.media.size < 1 || post.media.size > 10485760)) throw new Error('Check the post attachment.')
}
