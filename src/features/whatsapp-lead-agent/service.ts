export type LeadCategory = 'hot-lead' | 'faq' | 'spam'
export type LeadLocale = 'en' | 'ar'
export interface Inquiry { id: string; sender: string; message: string; source: 'dm' | 'comment' | 'inquiry' }
export interface ClassifiedInquiry extends Inquiry { category: LeadCategory; reason: string }
const spamTerms = /\b(?:free money|click here|crypto giveaway|buy followers|work from home guaranteed|http:\/\/bit\.ly)\b/i
const intentTerms = /\b(?:price|pricing|cost|book|booking|appointment|available|availability|order|buy|interested|quote|how much|call me|contact me)\b/i
const faqTerms = /\b(?:hours|opening|address|location|where are you|what time|delivery policy|return policy|how does it work|thank you|thanks)\b/i
const arabicSpam = /(?:اربح مجانا|اضغط هنا|هدية مجانية|عملات رقمية مجانية)/
const arabicIntent = /(?:كم السعر|السعر|أريد شراء|اريد شراء|حجز|موعد|هل متاح|متوفر|أريد طلب|اريد طلب|تواصلوا معي|اتصلوا بي)/
const arabicFaq = /(?:ما هي ساعات العمل|ساعات العمل|العنوان|أين أنتم|اين انتم|موقعكم|التوصيل|سياسة الإرجاع|شكرا|شكرًا)/
export function classifyInquiry(message: string): Pick<ClassifiedInquiry, 'category' | 'reason'> {
  const value = message.trim()
  if (!value) return { category: 'faq', reason: 'Empty message needs review.' }
  if (spamTerms.test(value) || arabicSpam.test(value)) return { category: 'spam', reason: 'Matches a common spam pattern.' }
  if (intentTerms.test(value) || arabicIntent.test(value)) return { category: 'hot-lead', reason: 'Shows purchase, booking, or contact intent.' }
  if (faqTerms.test(value) || arabicFaq.test(value) || value.length < 18) return { category: 'faq', reason: 'Looks like a routine question or short message.' }
  return { category: 'faq', reason: 'Needs human review; no strong buying signal detected.' }
}
export function normalizeOwnerNumber(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null
}
export function createRoutingPreview(inquiry: ClassifiedInquiry, ownerNumber: string): { destination: string; message: string; sendsMessage: false } | null {
  const destination = normalizeOwnerNumber(ownerNumber)
  if (!destination || inquiry.category !== 'hot-lead') return null
  const message = [
    'Velo Hot Lead summary (preview only)',
    `Source: ${inquiry.source}`,
    `Sender: ${inquiry.sender.slice(0, 100)}`,
    `Message: ${inquiry.message.slice(0, 700)}`,
    'Action: Owner review required; no message has been sent.',
  ].join('\n')
  return { destination, message, sendsMessage: false }
}
