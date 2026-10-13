import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LocaleContext } from './lib/locale'
import { translate, type Locale } from './lib/translations'

export default function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => { try { return localStorage.getItem('aasiflow-locale') === 'ar' ? 'ar' : 'en' } catch { return 'en' } })
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    try { localStorage.setItem('aasiflow-locale', locale) } catch { /* Preference persistence is optional. */ }
  }, [locale])
  const value = useMemo(() => ({ locale, setLocale, t: (text: string) => translate(locale, text) }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
