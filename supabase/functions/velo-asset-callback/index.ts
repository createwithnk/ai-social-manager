import { createAssetRuntime } from '../_shared/asset-bridge/runtime.ts'
import { createAssetCallbackHandler } from '../_shared/asset-bridge/service.ts'

// OAuth returns a GET without a bearer. One-use state and the original active
// session are checked by the service-only RPC before exchange and before save.
Deno.serve(createAssetCallbackHandler(createAssetRuntime(name => Deno.env.get(name) ?? '')))
