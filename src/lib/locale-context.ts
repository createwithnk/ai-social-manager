import { createContext, useContext } from 'react'
import type { Locale } from './locale'

export interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (message: string, values?: Record<string, string | number>) => string
  error: (message: string) => string
  number: (value: number) => string
  date: (value: string, includeTime?: boolean) => string
  price: (amount: number) => string
}
export const LocaleContext = createContext<LocaleContextValue | null>(null)
export function useLocale() {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('LocaleProvider is required.')
  return value
}
