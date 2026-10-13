import { useLocale } from './lib/locale'
import type { Locale } from './lib/translations'

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()
  return <label className="locale-switch"><span className="sr-only">{locale === 'ar' ? 'لغة الواجهة' : 'Interface language'}</span><select aria-label={locale === 'ar' ? 'لغة الواجهة' : 'Interface language'} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="en">English</option><option value="ar">العربية</option></select></label>
}
