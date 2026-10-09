import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../lib/locale-context'
import { loadTurnstile, type TurnstileApi } from '../lib/turnstile'

export function TurnstileChallenge({siteKey,action,onToken,onRetry,disabled}:{siteKey:string;action:string;onToken:(token:string)=>void;onRetry:()=>void;disabled:boolean}) {
  const { t, locale } = useLocale()
  const container = useRef<HTMLDivElement>(null)
  const [phase,setPhase] = useState<'loading'|'ready'|'verified'|'expired'|'error'>('loading')
  useEffect(() => {
    let active = true, widget: string | undefined, api: TurnstileApi | undefined
    void loadTurnstile().then(next => {
      if (!active || !container.current) return
      api = next
      setPhase('ready')
      const invalidate = (phase:'expired'|'error') => { if (active) { onToken(''); setPhase(phase) } }
      widget = next.render(container.current,{
        sitekey:siteKey,action,language:locale,size:'compact',theme:'light','response-field':false,retry:'never',
        callback:token => { if (active) { const valid = typeof token === 'string' && !!token.trim() && token.length <= 2048; onToken(valid ? token : ''); setPhase(valid ? 'verified' : 'error') } },
        'expired-callback':() => invalidate('expired'),
        'error-callback':() => invalidate('error'),
        'timeout-callback':() => invalidate('expired'),
      })
    }).catch(() => { if (active) { onToken(''); setPhase('error') } })
    return () => { active = false; if (widget && api) { try { api.remove(widget) } catch { /* The proof is invalidated by its parent key. */ } } }
  },[siteKey,action,locale,onToken])
  return <div className="captcha-check">
    <p>{t('Bot verification')}</p><div ref={container} className="captcha-widget" dir="ltr" />
    <p role="status" className="captcha-status">{t(phase === 'loading' ? 'Loading bot verification…' : phase === 'verified' ? 'Verification complete.' : phase === 'expired' ? 'Verification expired. Retry verification.' : phase === 'error' ? 'Bot verification could not load. Retry verification.' : 'Complete bot verification before continuing.')}</p>
    {(phase === 'expired' || phase === 'error') && <button type="button" className="ghost" onClick={onRetry} disabled={disabled}>{t('Retry verification')}</button>}
  </div>
}
