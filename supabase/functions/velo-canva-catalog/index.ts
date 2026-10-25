import { createAssetRuntime } from '../_shared/asset-bridge/runtime.ts'
import { createCanvaCatalogHandler } from '../_shared/canva-catalog/service.ts'

// Inactive source only. Not in the release manifest and not deployed.
Deno.serve(createCanvaCatalogHandler(createAssetRuntime(name => Deno.env.get(name) ?? ''), () => Deno.env.get('AASIFLOW_CANVA_CATALOG_ENABLED') === 'true'))
