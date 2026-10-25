import { supabase } from '../../lib/supabase'
import { assetConnectionApi, assetConnectionsEnabled } from '../assets/connection-client'
import { CanvaBridgeError, ownerId } from '../../../supabase/functions/_shared/canva-catalog/contracts.ts'
import { createCanvaCatalog } from './catalog'

export const canvaCatalogEnabled = import.meta.env.VITE_VELO_CANVA_BRIDGE === 'true'
export function veloCanvaCatalog(owner: string) {
  async function ready(signal: AbortSignal) {
    ownerId(owner)
    if (signal.aborted) throw new CanvaBridgeError('cancelled')
    if (!canvaCatalogEnabled || !assetConnectionsEnabled || !supabase || import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/,'') !== 'https://nkfecpdegcmsapvbviky.supabase.co') throw new CanvaBridgeError('setup_pending')
    const { data, error } = await supabase.auth.getUser()
    if (signal.aborted) throw new CanvaBridgeError('cancelled')
    if (error || data.user?.id !== owner) throw new CanvaBridgeError('sign_in')
    return supabase
  }
  return createCanvaCatalog(async (body, signal) => {
    const client = await ready(signal)
    const { data,error } = await client.functions.invoke('velo-canva-catalog', { body, signal, timeout: 60000 })
    if (error) {
      if (signal.aborted) throw new CanvaBridgeError('cancelled')
      const status = error.context?.status
      if (status === 401) throw new CanvaBridgeError('sign_in')
      if (status === 423) throw new CanvaBridgeError('setup_pending')
      if (status === 409) {
        let code: unknown
        try { code = (await error.context.clone().json()).error } catch { /* Fixed safe fallback. */ }
        throw new CanvaBridgeError(code === 'scope_required' ? 'scope_required' : 'connection_required')
      }
      throw new CanvaBridgeError('unavailable')
    }
    return data
  }, async signal => { await ready(signal); try { return await assetConnectionApi.start('canva') } catch { throw new CanvaBridgeError('connection_required') } }, `velo-canva:${owner}`)
}
