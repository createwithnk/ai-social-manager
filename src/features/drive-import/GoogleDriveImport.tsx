import { useMemo } from 'react'
import DriveMediaImporter from './DriveMediaImporter'
import { createGoogleDriveSource } from './google-picker.ts'
import { driveLabels } from './labels.ts'
import type { ImportReceipt, PickerConfig } from './types.ts'

/** Optional mount. Importing this component loads no Google script or account. */
export default function GoogleDriveImport({ ownerId, config, enabled = false, locale = 'en', onImported }: {
  ownerId: string; config: PickerConfig; enabled?: boolean; locale?: 'en' | 'ar'; onImported?: (receipts: readonly ImportReceipt[]) => void
}) {
  const { clientId, apiKey, projectNumber } = config
  const source = useMemo(() => {
    if (!enabled || typeof window === 'undefined') return null
    try { return createGoogleDriveSource({ clientId, apiKey, projectNumber, locale }) } catch { return null }
  }, [enabled, clientId, apiKey, projectNumber, locale])
  if (!source) return <section className="velo-drive-import" dir={locale === 'ar' ? 'rtl' : 'ltr'}><h2>{driveLabels(locale).title}</h2><p role="status">{driveLabels(locale).setup}</p></section>
  return <DriveMediaImporter ownerId={ownerId} source={source} enabled={enabled} locale={locale} onImported={onImported} />
}
