import { supabase } from '../../lib/supabase'
import { AssetConnectionError, createAssetConnectionApi } from './connections'

// Public UI switch only; never put OAuth credentials or encryption keys in Vite.
export const assetConnectionsEnabled = import.meta.env.VITE_VELO_ASSET_CONNECTIONS === 'true'
export const assetConnectionApi = createAssetConnectionApi(async body => {
  if (!assetConnectionsEnabled || !supabase || import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== 'https://nkfecpdegcmsapvbviky.supabase.co') throw new AssetConnectionError('Asset account setup is pending.')
  const client = supabase
  try {
    const { data: session, error: authError } = await client.auth.getSession()
    if (authError || !session.session) throw new AssetConnectionError('Sign in again to connect asset accounts.')
    const { data, error } = await client.functions.invoke('velo-asset-account', { body, timeout: 60000 })
    if (error) {
      if (error.context?.status === 401) throw new AssetConnectionError('Sign in again to connect asset accounts.')
      if ([400, 409].includes(error.context?.status)) throw new AssetConnectionError('Reconnect the account or select an authorized file.')
      if ([423, 503].includes(error.context?.status)) throw new AssetConnectionError('Asset account setup is pending.')
      throw new AssetConnectionError('Asset accounts are unavailable. No files were changed.')
    }
    return data
  } catch (error) { if (error instanceof AssetConnectionError) throw error; throw new AssetConnectionError('Asset accounts are unavailable. No files were changed.') }
})
