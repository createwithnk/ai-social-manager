import { supabase } from '../../lib/supabase'
import { betaUploadsEnabled } from '../../lib/beta-policy'
import { uploadMedia } from '../../lib/media'
import { DriveImportError, validOwner, type ImportTarget } from './types.ts'

// Adapter only. No Auth configuration, RLS, bucket, schema or core file changes.
export const veloMediaTarget: ImportTarget = {
  isEnabled: () => betaUploadsEnabled,
  async assertReady(ownerId) {
    if (!betaUploadsEnabled) throw new DriveImportError('paused')
    if (!validOwner(ownerId) || !supabase || import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== 'https://nkfecpdegcmsapvbviky.supabase.co') throw new DriveImportError('signin')
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error || data.user?.id !== ownerId) throw new DriveImportError('signin')
      const active = await supabase.rpc('has_active_session')
      if (active.error || active.data !== true) throw new DriveImportError('signin')
    } catch { throw new DriveImportError('signin') }
  },
  async upload(ownerId, file) {
    await this.assertReady(ownerId)
    return uploadMedia(ownerId, file)
  },
}
