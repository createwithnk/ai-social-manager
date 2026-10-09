import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatDate, formatNumber, formatPrice, localeStorageKey, localizedError, preferredLocale, translate, type Locale } from '../lib/locale'
import { LocaleContext } from '../lib/locale-context'

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(localeStorageKey) } catch { /* Preference storage is optional. */ }
    return preferredLocale(saved, navigator.languages)
  })
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    try { localStorage.setItem(localeStorageKey, locale) } catch { /* The current selection still works. */ }
  }, [locale])
  const value = useMemo(() => ({
    locale, setLocale,
    t: (message: string, values?: Record<string, string | number>) => translate(locale, message, values),
    error: (message: string) => localizedError(locale, message),
    number: (value: number) => formatNumber(locale, value),
    date: (value: string, includeTime?: boolean) => formatDate(locale, value, includeTime),
    price: (amount: number) => formatPrice(locale, amount),
  }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
