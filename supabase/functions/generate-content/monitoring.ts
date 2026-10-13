export type AiOutcome = 'success' | 'provider_error' | 'invalid_response' | 'timeout' | 'attachment_error'
export interface AiUsage { inputTokens: number; outputTokens: number }
export interface AiReservation { id: string; maxOutputTokens: number }
export function readUsage(result: unknown): AiUsage | null {
  if (!result || typeof result !== 'object' || !('usageMetadata' in result)) return null
  const usage = result.usageMetadata as Record<string, unknown> | null
  if (!usage || typeof usage !== 'object') return null
  const input = usage.promptTokenCount, candidates = usage.candidatesTokenCount, thoughts = usage.thoughtsTokenCount === undefined ? 0 : usage.thoughtsTokenCount
  const counts = [input, candidates, thoughts, usage.totalTokenCount]
  if (!counts.every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000)) return null
  const output = (candidates as number) + (thoughts as number)
  if (output > 1000000 || usage.totalTokenCount !== (input as number) + output ||
      (usage.cachedContentTokenCount === undefined ? 0 : usage.cachedContentTokenCount) !== 0 ||
      (usage.toolUsePromptTokenCount === undefined ? 0 : usage.toolUsePromptTokenCount) !== 0) return null
  return { inputTokens: input as number, outputTokens: output }
}
export function validReservation(value: unknown): value is AiReservation {
  if (!value || typeof value !== 'object') return false
  const item = value as AiReservation
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) &&
    Number.isInteger(item.maxOutputTokens) && item.maxOutputTokens >= 128 && item.maxOutputTokens <= 2048
}
