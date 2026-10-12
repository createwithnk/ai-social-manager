import type { Post, Platform, PostStatus, ContentLanguage } from '../types'
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
  language: 'English' | 'Arabic' | 'Hindi' | 'Urdu'
  media: Post['media'] | null
  revision: number
}

const columns = 'id, user_id, idea, platform, tone, caption, hashtags, status, created_at, scheduled_for, language, media, revision'
const languages = { en: 'English', ar: 'Arabic', hi: 'Hindi', ur: 'Urdu' } as const
const languageCodes: Record<string, ContentLanguage> = { English: 'en', Arabic: 'ar', Hindi: 'hi', Urdu: 'ur' }

function toPost(row: PostRow): Post {
  if (!Object.hasOwn(languageCodes, row.language)) throw new Error('Stored content language needs review before editing.')
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
    language: languageCodes[row.language],
    media: row.media ?? undefined,
    revision: row.revision,
  }
}

export async function fetchPosts(userId: string): Promise<Post[]> {
  if (!supabase) return []
  if (!userId) throw new Error('Sign in before loading content.')
  const { data, error } = await supabase
    .from('posts')
    .select(columns)
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
      language: languages[post.language ?? 'en'],
      media: post.media ?? null,
      caption: post.caption,
      hashtags: post.hashtags,
      status: post.status,
      scheduled_for: post.scheduledFor ?? null,
    }
  if (existing && !Number.isInteger(post.revision)) throw new Error('Refresh and review this post before saving.')
  // INSERT triggers run before conflict resolution, so scheduling must use UPDATE.
  const write = existing
    ? supabase.from('posts').update(payload).eq('id', post.id).eq('user_id', userId).eq('revision', post.revision!)
    : supabase.from('posts').insert({ ...payload, created_at: post.createdAt })
  const { data, error } = await write
    .select(columns)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('This post changed on another device. Refresh and review the latest version before saving.')
  return toPost(data as PostRow)
}
