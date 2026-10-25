// Read-only Management API metadata for AasiFlowAI. Never restores or downloads data.
import { pathToFileURL } from 'node:url'

export const AASIFLOW_PROJECT_REF = 'nkfecpdegcmsapvbviky'
export const BACKUP_INVENTORY_URL = `https://api.supabase.com/v1/projects/${AASIFLOW_PROJECT_REF}/database/backups`
export const MAX_INVENTORY_BYTES = 256 * 1024
const MAX_REQUEST_MS = 10_000

class InventoryError extends Error {
  constructor(code) { super(code); this.code = code }
}

function receipt(status, reason, extra = {}) {
  return {
    projectRef: AASIFLOW_PROJECT_REF, status, reason,
    inventoryVerified: false, hostedBackupVerified: false,
    storageObjectsVerified: false, liveChanges: false, providerCalls: false,
    ...extra,
  }
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const millis = Date.parse(value)
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null
}

function summarize(data) {
  if (!data || !Array.isArray(data.backups) || data.backups.length > 5000 ||
      typeof data.walg_enabled !== 'boolean' || typeof data.pitr_enabled !== 'boolean') {
    throw new InventoryError('unrecognized_inventory')
  }
  const backups = data.backups.map(item => {
    if (!item || typeof item.status !== 'string' || typeof item.is_physical_backup !== 'boolean') throw new InventoryError('unrecognized_inventory')
    return {
      status: item.status === 'COMPLETED' ? 'COMPLETED' : 'OTHER',
      physical: item.is_physical_backup,
      createdAt: timestamp(item.inserted_at),
    }
  })
  // IDs, signed URLs, role credentials and unrecognized response properties are omitted.
  return {
    inventoryVerified: true, backupCount: backups.length,
    completedCount: backups.filter(item => item.status === 'COMPLETED').length,
    walGEnabled: data.walg_enabled, pitrEnabled: data.pitr_enabled, backups,
  }
}

export async function inspectBackupInventory({ projectRef = AASIFLOW_PROJECT_REF, token, fetchImpl = globalThis.fetch, timeoutMs = MAX_REQUEST_MS } = {}) {
  // Check scope BEFORE checking credentials or touching the network.
  if (projectRef !== AASIFLOW_PROJECT_REF) return receipt('blocked', 'project_scope_mismatch')
  if (typeof token !== 'string' || !token || token.length > 8192 || /\s/.test(token)) return receipt('blocked', 'aasi_read_token_required')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_REQUEST_MS) return receipt('blocked', 'invalid_deadline')
  const controller = new AbortController()
  let timer, reader, response, finishedBody = false
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new InventoryError('request_timed_out')) }, timeoutMs)
    })
    const request = (async () => {
      response = await fetchImpl(BACKUP_INVENTORY_URL, {
        method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.redirected || (response.url && response.url !== BACKUP_INVENTORY_URL)) throw new InventoryError('unexpected_response_origin')
      if (response.status !== 200) throw new InventoryError(`management_http_${Number.isInteger(response.status) ? response.status : 'unknown'}`)
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new InventoryError('unrecognized_content_type')
      const length = response.headers.get('content-length')
      if (length && /^\d+$/.test(length) && Number(length) > MAX_INVENTORY_BYTES) throw new InventoryError('response_too_large')
      if (!response.body) throw new InventoryError('empty_response')
      reader = response.body.getReader()
      const chunks = []
      let total = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) { finishedBody = true; break }
        if (!(value instanceof Uint8Array)) throw new InventoryError('unrecognized_inventory')
        total += value.byteLength
        if (total > MAX_INVENTORY_BYTES) throw new InventoryError('response_too_large')
        chunks.push(value)
      }
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      let data
      try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new InventoryError('invalid_inventory_json') }
      return summarize(data)
    })()
    return receipt('observed', 'metadata_only_not_recovery_proof', await Promise.race([request, deadline]))
  } catch (error) {
    return receipt('blocked', error instanceof InventoryError ? error.code : 'management_request_failed')
  } finally {
    clearTimeout(timer)
    controller.abort()
    if (reader && !finishedBody) void reader.cancel().catch(() => {})
    else if (!reader && response?.body) void response.body.cancel().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = process.argv.length === 2
    ? await inspectBackupInventory({ token: process.env.AASIFLOW_SUPABASE_READ_TOKEN })
    : receipt('blocked', 'no_cli_arguments_supported')
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  process.exitCode = result.status === 'observed' ? 0 : 2
}
