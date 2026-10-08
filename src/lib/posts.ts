import type { Post, Platform, PostStatus } from '../types'
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
  media: Post['media'] | null
  language: string
  revision?:number
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
    language: row.language,
    revision:row.revision,
  }
}

export async function fetchPosts(): Promise<Post[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as PostRow[] ?? []).map(toPost)
}

export async function savePostForUser(post: Post, userId: string): Promise<Post> {
  if (!supabase) return post

  const values = {
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
      language: post.language ?? 'English',
    }
  const query = Number.isInteger(post.revision)
    ? supabase.from('posts').update(values).eq('id',post.id).eq('revision',post.revision!).eq('user_id',userId)
    : supabase.from('posts').upsert(values,{onConflict:'id'})
  const {data,error} = await query.select('*').maybeSingle()

  if (error) throw error
  if (!data) throw new Error('This post changed on another device. Refresh and review the latest version before saving.')
  return toPost(data as PostRow)
}
