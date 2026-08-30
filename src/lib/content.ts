import type { Platform } from '../types'

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
