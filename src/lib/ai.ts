import type { Platform } from '../types'
import { supabase } from './supabase'

export interface GeneratedDraft { caption: string; hashtags: string[] }

export async function generateAiDraft(idea: string, platform: Platform, tone: string): Promise<GeneratedDraft> {
  if (!supabase) throw new Error('Sign in to use AI generation.')
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { idea: idea.trim(), platform, tone }
  })
  if (error) throw new Error('AI generation is unavailable. Please check the server setup and try again.')
  if (!data || typeof data.caption !== 'string' || !Array.isArray(data.hashtags) ||
      !data.hashtags.every((tag: unknown) => typeof tag === 'string')) {
    throw new Error('The AI returned an invalid draft.')
  }
  return { caption: data.caption, hashtags: data.hashtags }
}
