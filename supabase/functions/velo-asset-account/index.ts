import { createAssetRuntime } from '../_shared/asset-bridge/runtime.ts'
import { createAssetAccountHandler } from '../_shared/asset-bridge/service.ts'

// New, inactive entrypoint. Deployment and hosted SQL/configuration remain separate.
Deno.serve(createAssetAccountHandler(createAssetRuntime(name => Deno.env.get(name) ?? '')))
