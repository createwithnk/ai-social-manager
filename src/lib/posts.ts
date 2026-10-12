import type { Post, Platform, PostStatus, ContentLanguage, Market } from '../types'
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
  language: ContentLanguage
  market: Market
  approved_at: string | null
  approved_by: string | null
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
    language: row.language,
    market: row.market,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
  }
}

export async function fetchPosts(userId: string): Promise<Post[]> {
  if (!supabase) return []
  if (!userId) throw new Error('Sign in before loading content.')
  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, idea, platform, tone, caption, hashtags, status, created_at, scheduled_for, language, market, approved_at, approved_by')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as PostRow[] ?? []).map(toPost)
}

export async function savePostForUser(post: Post, userId: string): Promise<Post> {
  if (!supabase) return post
  if (!userId) throw new Error('Sign in before saving content.')
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  if (sessionError || !sessionData.user || sessionData.user.id !== userId) {
    throw new Error('Your session is invalid. Please sign in again.')
  }

  const { data: existing, error: lookupError } = await supabase.from('posts')
    .select('id').eq('id', post.id).eq('user_id', userId).maybeSingle()
  if (lookupError) throw lookupError
  const payload = {
      id: post.id,
      user_id: userId,
      idea: post.idea,
      platform: post.platform,
      tone: post.tone,
      language: post.language ?? 'en',
      market: post.market ?? 'General',
      caption: post.caption,
      hashtags: post.hashtags,
      status: post.status,
      created_at: post.createdAt,
      scheduled_for: post.scheduledFor ?? null,
    }
  // INSERT triggers run before conflict resolution, so scheduling must use UPDATE.
  const write = existing
    ? supabase.from('posts').update(payload).eq('id', post.id).eq('user_id', userId)
    : supabase.from('posts').insert(payload)
  const { data, error } = await write
    .select('id, user_id, idea, platform, tone, caption, hashtags, status, created_at, scheduled_for, language, market, approved_at, approved_by')
    .single()

  if (error) throw error
  return toPost(data as PostRow)
}
