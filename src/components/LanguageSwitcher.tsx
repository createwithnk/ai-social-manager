import { useLocale } from '../lib/locale-context'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale()
  return <label className="language-switcher"><span className="sr-only">{t('Interface language')}</span>
    <select value={locale} aria-label={t('Interface language')} onChange={event => setLocale(event.target.value === 'ar' ? 'ar' : 'en')}>
      <option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option>
    </select>
  </label>
}
