import { CanvaBridgeError, canvaId, pageResult, queryInput, record, reference, type CanvaReference } from '../../../supabase/functions/_shared/canva-catalog/contracts.ts'
import type { CanvaCatalog } from './types.ts'

export type CatalogInvoker = (body: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
// Injection seam for tests/hosts. No provider token or arbitrary URL is accepted.
export function createCanvaCatalog(invoke: CatalogInvoker, connect: (signal: AbortSignal) => Promise<string>, id = 'velo-canva-catalog'): CanvaCatalog {
  return {
    id,
    connect,
    async list(input, signal) {
      const query = queryInput(input)
      const data = record(await invoke({ action: 'list', ...query }, signal))
      return pageResult(data.page, query.kind)
    },
    async get(selected, signal) {
      const item = reference(selected)
      const data = record(await invoke({ action: 'get', kind: item.kind, id: canvaId(item.id) }, signal))
      const result: CanvaReference = reference(data.item)
      if (result.kind !== item.kind || result.id !== item.id || result.origin !== 'account') throw new CanvaBridgeError('invalid')
      return result
    },
  }
}
export async function bounded<T>(signal: AbortSignal, action: (signal: AbortSignal) => Promise<T>, timeoutMs = 60000): Promise<T> {
  if (signal.aborted) throw new CanvaBridgeError('cancelled')
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined, cancel: () => void = () => {}
  const stop = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new CanvaBridgeError('cancelled')) }
    signal.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => { controller.abort(); reject(new CanvaBridgeError('unavailable')) }, timeoutMs)
  })
  try { return await Promise.race([stop, action(controller.signal)]) }
  catch (error) { if (error instanceof CanvaBridgeError) throw error; throw new CanvaBridgeError('unavailable') }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); controller.abort() }
}
