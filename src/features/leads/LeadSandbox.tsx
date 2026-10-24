import { useRef, useState } from 'react'
import { createLeadFilter, sampleFaqs, type LeadCategory, type LeadDecision } from './filter'
import { useVeloLocale } from '../velo/locale'

const labels: Record<LeadCategory, string> = { 'opt-out': 'Opted out', human: 'Human help', hot: 'Hot lead', faq: 'FAQ match' }
export default function LeadSandbox() {
  const { t } = useVeloLocale()
  const filter = useRef<ReturnType<typeof createLeadFilter> | null>(null)
  const sequence = useRef(0)
  const [text, setText] = useState('')
  const [consent, setConsent] = useState(false)
  const [decision, setDecision] = useState<LeadDecision | null>(null)
  const [error, setError] = useState('')
  function classify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDecision(null); setError('')
    try {
      filter.current ??= createLeadFilter('sample-business', sampleFaqs)
      setDecision(filter.current.process({ businessId: 'sample-business', conversationId: 'sample-customer', id: `sample-${++sequence.current}`, text, customerRoutingConsent: consent }))
    } catch { setError('The sample could not be classified.') }
  }
  function reset() { filter.current = null; sequence.current = 0; setDecision(null); setError(''); setText(''); setConsent(false) }
  return <div className="panel velo-stack">
    <h2>{t('WhatsApp enquiry sandbox')}</h2><p>{t('Use made-up enquiries only. No WhatsApp account is connected and no messages are sent.')}</p>
    <p>{t('The sample FAQ is not your business information.')}</p>
    <form onSubmit={classify} className="velo-stack">
      <div><label htmlFor="velo-lead-sample">{t('Sample enquiry')}</label><textarea id="velo-lead-sample" value={text} required maxLength={2000} dir="auto" onChange={event => { setText(event.target.value); setDecision(null) }} /></div>
      <label className="velo-check"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setDecision(null) }} />{t('Simulate customer consent for owner routing')}</label>
      <button className="primary" type="submit">{t('Classify sample')}</button>
    </form>
    <button className="ghost" type="button" onClick={reset}>{t('Start new sample conversation')}</button>
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    {decision && <div aria-live="polite" className="velo-result"><h3>{t(labels[decision.category])}</h3><p>{t(decision.reason)}</p>{decision.suggestedReply && <><h4>{t('Suggested answer for human review')}</h4><p>{t(decision.suggestedReply)}</p></>}{decision.routeCandidate && <p>{t('Owner handover candidate. Nothing was sent.')}</p>}</div>}
  </div>
}
