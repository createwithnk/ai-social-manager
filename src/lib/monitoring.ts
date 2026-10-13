import { supabase } from './supabase'
export type RuntimeErrorCode = 'render_failed' | 'unhandled_error' | 'unhandled_rejection' | 'ai_failed' | 'save_failed' | 'upload_failed'
const allowed = new Set<RuntimeErrorCode>(['render_failed','unhandled_error','unhandled_rejection','ai_failed','save_failed','upload_failed'])
let reports = 0
const lastReport = new Map<RuntimeErrorCode, number>()
// Coded, bounded counters only. Never accept messages, stack traces, URLs,
// request bodies, emails, prompts, file names or SDK error objects.
export async function reportRuntimeError(code: RuntimeErrorCode): Promise<void> {
  if (!supabase || !allowed.has(code) || reports >= 20) return
  const now = Date.now()
  if (now - (lastReport.get(code) ?? -Infinity) < 60000) return
  reports++; lastReport.set(code, now)
  try { await supabase.rpc('report_runtime_error', { error_code: code }).abortSignal(AbortSignal.timeout(3000)) }
  catch { /* Monitoring failure cannot break the workspace or recurse. */ }
}
