export interface BusinessFaq { id: string; terms: readonly string[]; reply: string }
export interface LeadMessage { id: string; businessId: string; conversationId: string; text: string; customerRoutingConsent: boolean }
export type LeadCategory = 'opt-out' | 'human' | 'hot' | 'faq'
export interface LeadDecision {
  category: LeadCategory
  reason: string
  suggestedReply: string | null
  routeCandidate: boolean
  duplicate: boolean
  sent: false
}
export const sampleFaqs: readonly BusinessFaq[] = [
  { id: 'hours', terms: ['opening hours', 'what time', 'مواعيد العمل', 'اوقات العمل'], reply: 'Sample only: our opening hours are 10 AM to 7 PM. A person can confirm availability.' },
  { id: 'location', terms: ['where are you', 'your location', 'اين موقع', 'اين انتم'], reply: 'Sample only: please ask the team to confirm the business location.' },
]
function normalize(text: string) { return text.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim() }
const human = /refund|complaint|cancel|human|person|شكوى|استرجاع|الغاء|موظف|انسان|शिकायत|واپسی/u
const optOut = /^(?:(?:please )?(?:stop(?: (?:messaging|contacting) me)?|unsubscribe(?: me)?|opt out)|(?:do not|don't|dont) (?:contact|message) me(?: again)?|no more messages|توقف|من فضلك توقف|لا تراسلني|ايقاف|الغاء الاشتراك|رک جائیں|بند کرو|बंद करो)[.!؟?\s]*$/u
const negation = /\b(?:do not|don't|dont|not|never|no longer)\b|لا اريد|لا ارغب|نہیں|نهي|नहीं/u
const intent = /\bi (?:want|would like|need) to (?:book|buy|order|reserve)\b|\bbook (?:me|an appointment|a slot)\b|اريد (?:الحجز|حجز|شراء|طلب)|احجز لي|مجھے (?:بکنگ|خرید)|मुझे (?:बुक|खरीद)/u

// One isolated, bounded session per business; consent/opt-out/handover remain per conversation.
// No persistence, network or autonomous replies. Production needs durable deduplication.
export function createLeadFilter(businessId: string, faqs: readonly BusinessFaq[]) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(businessId) || faqs.length > 30 || faqs.some(faq => !faq.id || faq.id.length > 80 || !faq.reply.trim() || faq.reply.length > 1200 || faq.terms.length > 12 || faq.terms.some(term => !term.trim() || term.length > 100))) throw new Error('Review the business FAQ configuration.')
  const approvedFaqs = faqs.map(faq => ({ ...faq, terms: faq.terms.map(normalize) }))
  const seen = new Map<string, { text: string; conversationId: string; result: LeadDecision }>()
  const conversations = new Map<string, { optedOut: boolean; handedToHuman: boolean }>()
  return {
    process(message: LeadMessage): LeadDecision {
      if (message.businessId !== businessId) throw new Error('This enquiry belongs to another business.')
      if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(message.id) || !/^[A-Za-z0-9_.:-]{1,160}$/.test(message.conversationId) || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 2000 || typeof message.customerRoutingConsent !== 'boolean') throw new Error('Use a sample enquiry between 1 and 2000 characters.')
      const previous = seen.get(message.id)
      if (previous) {
        if (previous.text !== message.text || previous.conversationId !== message.conversationId) throw new Error('This message identifier was already used for another enquiry.')
        return { ...previous.result, duplicate: true, routeCandidate: false, suggestedReply: null }
      }
      if (seen.size >= 200) throw new Error('Start a new sample session before testing more enquiries.')
      const text = normalize(message.text)
      const state = conversations.get(message.conversationId) ?? { optedOut: false, handedToHuman: false }
      let decision: LeadDecision
      if (state.optedOut || optOut.test(text)) {
        state.optedOut = true
        decision = { category: 'opt-out', reason: 'Stop messaging and suppress routing.', suggestedReply: null, routeCandidate: false, duplicate: false, sent: false }
      } else if (state.handedToHuman || human.test(text)) {
        state.handedToHuman = true
        decision = { category: 'human', reason: 'A person must handle this enquiry.', suggestedReply: null, routeCandidate: false, duplicate: false, sent: false }
      } else if (!negation.test(text) && intent.test(text)) {
        decision = { category: 'hot', reason: message.customerRoutingConsent ? 'Explicit buying or booking intent; owner handover can be reviewed.' : 'Buying or booking intent; routing consent is still required.', suggestedReply: null, routeCandidate: message.customerRoutingConsent, duplicate: false, sent: false }
      } else {
        const matches = approvedFaqs.filter(faq => faq.terms.some(term => text.includes(term)))
        decision = matches.length === 1
          ? { category: 'faq', reason: 'One approved FAQ matches. Review the suggested answer.', suggestedReply: matches[0].reply, routeCandidate: false, duplicate: false, sent: false }
          : { category: 'human', reason: 'Unknown or ambiguous enquiry; ask a person.', suggestedReply: null, routeCandidate: false, duplicate: false, sent: false }
      }
      conversations.set(message.conversationId, state)
      seen.set(message.id, { text: message.text, conversationId: message.conversationId, result: { ...decision } })
      return { ...decision }
    },
  }
}
