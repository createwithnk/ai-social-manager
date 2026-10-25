import type { Post } from '../../types'
import type { CanvaPage, CanvaQuery, CanvaReference } from '../../../supabase/functions/_shared/canva-catalog/contracts.ts'
export type { CanvaKind, CanvaPage, CanvaQuery, CanvaReference } from '../../../supabase/functions/_shared/canva-catalog/contracts.ts'
export interface CanvaCatalog {
  readonly id: string
  connect(signal: AbortSignal): Promise<string>
  list(input: CanvaQuery, signal: AbortSignal): Promise<CanvaPage>
  get(item: CanvaReference, signal: AbortSignal): Promise<CanvaReference>
}
export interface BridgeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface CanvaPostMapping {
  postId: string
  postFingerprint: string
  scheduledFor: string
  reference: CanvaReference
  linkedAt: string
}
export interface CanvaWorkspace { version: 1; ownerId: string; references: CanvaReference[]; mappings: CanvaPostMapping[] }
export interface WorkspaceRead { raw: string | null; value: CanvaWorkspace }
export interface CanvaBridgeProps {
  ownerId: string
  posts: readonly Post[]
  enabled?: boolean
  locale?: 'en' | 'ar'
  catalog?: CanvaCatalog
  storage?: BridgeStorage
}
