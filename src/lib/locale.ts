import { createContext, useContext } from 'react'
import { translate, type Locale } from './translations'

export const LocaleContext = createContext({ locale: 'en' as Locale, setLocale: (locale: Locale) => { void locale }, t: (text: string) => translate('en', text) })
export function useLocale() { return useContext(LocaleContext) }
