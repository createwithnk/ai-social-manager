import type { Post, Platform, PostStatus, PostMedia } from '../types'
import { supabase } from './supabase'

interface PostRow {
  id: string
  user_id: string
  idea: string
  platform: Platform
  tone: string
  caption: string
  hashtags: string[]
  status: PostStatus
  created_at: string
  scheduled_for: string | null
  media: PostMedia | null
}

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    idea: row.idea,
    platform: row.platform,
    tone: row.tone,
    caption: row.caption,
    hashtags: row.hashtags,
    status: row.status,
    createdAt: row.created_at,
    scheduledFor: row.scheduled_for ?? undefined,
    media: row.media ?? undefined,
  }
}

export async function fetchPosts(): Promise<Post[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, idea, platform, tone, caption, hashtags, status, created_at, scheduled_for, media')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as PostRow[] ?? []).map(toPost)
}

export async function savePostForUser(post: Post, userId: string): Promise<Post> {
  if (!supabase) return post

  const { data, error } = await supabase
    .from('posts')
    .upsert({
      id: post.id,
      user_id: userId,
      idea: post.idea,
      platform: post.platform,
      tone: post.tone,
      caption: post.caption,
      hashtags: post.hashtags,
      status: post.status,
      created_at: post.createdAt,
      scheduled_for: post.scheduledFor ?? null,
      media: post.media ?? null,
    }, { onConflict: 'id' })
    .select('id, user_id, idea, platform, tone, caption, hashtags, status, created_at, scheduled_for, media')
    .single()

  if (error) throw error
  return toPost(data as PostRow)
}
