import type { Post } from '../types'
export const captionLimits = { Instagram: 2200, LinkedIn: 3000, Facebook: 63206, X: 280 }
export function validatePost(post: Post, now = Date.now()) {
  if (!post.idea.trim() || post.idea.length > 500) throw new Error('Add an idea of up to 500 characters.')
  if (!post.caption.trim()) throw new Error('Caption cannot be empty.')
  const text = `${post.caption}\n\n${post.hashtags.map(t => `#${t}`).join(' ')}`.trim()
  if ([...text].length > captionLimits[post.platform]) throw new Error(`Caption and hashtags exceed the ${captionLimits[post.platform]} character limit.`)
  if (post.status === 'scheduled' && (!post.scheduledFor || !Number.isFinite(Date.parse(post.scheduledFor)) || Date.parse(post.scheduledFor) <= now)) throw new Error('Choose a future date and time.')
  if (post.status !== 'scheduled' && post.scheduledFor) throw new Error('Only scheduled posts can have a schedule.')
}
