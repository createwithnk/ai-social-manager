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

export async function generateDraft(idea: string, platform: Platform, tone: string): Promise<{ caption: string; hashtags: string[] }> {
  if (!supabase) return createDraft(idea, platform, tone)
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session) throw new Error('Please sign in again before generating content.')
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { idea: idea.trim(), platform, tone },
  })
  if (error) {
    let message = 'AI generation failed. Check that the generation service is deployed and configured, then retry.'
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json()
        if (typeof body.error === 'string') message = body.error
      } catch { /* Keep the safe fallback message. */ }
    }
    throw new Error(message)
  }
  if (!data || typeof data.caption !== 'string' || !data.caption.trim() || !Array.isArray(data.hashtags) || !data.hashtags.every((tag: unknown) => typeof tag === 'string')) {
    throw new Error('AI returned an invalid draft. Please try again.')
  }
  return { caption: data.caption, hashtags: data.hashtags }
}
