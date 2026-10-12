import type { ContentLanguage, Market, Platform, Media } from '../types'
import { supabase } from './supabase'

export interface GeneratedDraft { caption: string; hashtags: string[] }

export async function generateAiDraft(idea: string, platform: Platform, tone: string, language: ContentLanguage = 'en', market: Market = 'General', media?: Media): Promise<GeneratedDraft> {
  if (!supabase) throw new Error('Sign in to use AI generation.')
  if (idea.trim().length < 10 || idea.length > 500 ||
      !['Instagram', 'LinkedIn', 'Facebook', 'X'].includes(platform) ||
      !['Friendly', 'Professional', 'Bold', 'Educational'].includes(tone) ||
      !['en', 'ar', 'hi', 'ur'].includes(language) || !['General', 'UAE', 'Saudi Arabia', 'Kuwait', 'Gulf'].includes(market)) {
    throw new Error('Provide a valid idea, platform, and tone.')
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session) throw new Error('Sign in again to use AI generation.')
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { idea: idea.trim(), platform, tone, language: { en: 'English', ar: 'Arabic', hi: 'Hindi', ur: 'Urdu' }[language], market, ...(media ? { media } : {}) }
  })
  if (error) {
    const status = error.context?.status
    if (status === 401) throw new Error('Your session expired. Sign in again to generate content.')
    if (status === 429) throw new Error('Daily AI limit reached. Try again after midnight UTC.')
    throw new Error('AI generation is unavailable. Please check the server setup and try again.')
  }
  if (!data || typeof data.caption !== 'string' || !data.caption.trim() || data.caption.length > 10000 ||
      !Array.isArray(data.hashtags) || data.hashtags.length > 8 ||
      !data.hashtags.every((tag: unknown) => typeof tag === 'string' && /^[\p{L}\p{M}\p{N}_]{1,80}$/u.test(tag)) ||
      new Set(data.hashtags).size !== data.hashtags.length) {
    throw new Error('The AI returned an invalid draft.')
  }
  const limits = { Instagram: 2200, LinkedIn: 3000, Facebook: 63206, X: 280 }
  if ([...`${data.caption.trim()}\n\n${data.hashtags.map((tag: string) => `#${tag}`).join(' ')}`.trim()].length > limits[platform]) throw new Error('The AI returned an invalid draft.')
  return { caption: data.caption.trim(), hashtags: data.hashtags }
}
