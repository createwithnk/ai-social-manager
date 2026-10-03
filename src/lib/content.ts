import type { Platform } from '../types'
import { supabase } from './supabase'

const tags: Record<Platform,string[]> = {
  Instagram:['ContentCreator','SocialMediaTips','AIGrowth','DigitalMarketing','CreateBetter'],
  LinkedIn:['ContentStrategy','Marketing','ArtificialIntelligence','BusinessGrowth'],
  Facebook:['SmallBusiness','DigitalGrowth','SocialMediaMarketing'],
  X:['BuildInPublic','AI','Marketing']
}

export function createDraft(idea:string, platform:Platform, tone:string) {
  const clean = idea.trim().replace(/\s+/g,' ')
  const hooks:Record<string,string> = {
    Professional:'A practical idea worth paying attention to:',
    Friendly:'Here is something simple that can make a real difference:',
    Bold:'Stop scrolling—this changes how you approach content:',
    Educational:'A quick lesson you can apply today:'
  }
  const closer = platform === 'LinkedIn' ? 'What would you add to this approach?' : 'Save this and share your view below.'
  return { caption:`${hooks[tone] ?? hooks.Friendly}\n\n${clean}\n\n${closer}`, hashtags:tags[platform] }
}

// No paid provider is called from the browser; authentication travels to the Edge Function.
export async function generateContent(idea: string, platform: Platform, tone: string, language: string, media?: import('../types').Media) {
  if (!supabase) throw new Error('Connect your account before using AI. You can still use the local template.')
  const { data, error } = await supabase.functions.invoke('generate-content', { body: { idea, platform, tone, language, media } })
  if (error) {
    let message = 'AI is unavailable. Check the server setup and try again.'
    try { const response = await error.context?.json(); if (typeof response?.error === 'string') message = response.error } catch { /* Keep safe fallback. */ }
    throw new Error(message)
  }
  if (!data || typeof data.caption !== 'string' || !Array.isArray(data.hashtags) || !data.hashtags.every((tag: unknown) => typeof tag === 'string')) throw new Error('AI returned an invalid draft. Please retry.')
  return { caption: data.caption as string, hashtags: data.hashtags as string[] }
}
