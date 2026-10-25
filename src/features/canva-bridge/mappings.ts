// Separate, versioned browser records. Never imports a post writer or publisher.
import type { Post } from '../../types.ts'
import { CanvaBridgeError, ownerId, record, reference, referenceKey, type CanvaReference } from '../../../supabase/functions/_shared/canva-catalog/contracts.ts'
import type { BridgeStorage, CanvaPostMapping, CanvaWorkspace, WorkspaceRead } from './types.ts'

export const REFERENCE_LIMIT = 100, MAPPING_LIMIT = 200
export function workspaceKey(owner: string): string { return `velo:canva-bridge:v1:${ownerId(owner)}` }
export function scheduledPost(post: Post | undefined): post is Post & { scheduledFor: string } {
  return !!post && typeof post.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(post.id) && post.status === 'scheduled' && typeof post.scheduledFor === 'string' && Number.isFinite(Date.parse(post.scheduledFor))
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw new CanvaBridgeError('storage')
  return value
}
function mapping(value: unknown): CanvaPostMapping {
  const row = record(value)
  if (typeof row.postId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.postId) || typeof row.postFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(row.postFingerprint)) throw new CanvaBridgeError('storage')
  return { postId: row.postId, postFingerprint: row.postFingerprint, scheduledFor: timestamp(row.scheduledFor), reference: reference(row.reference), linkedAt: timestamp(row.linkedAt) }
}
export function readWorkspace(storage: BridgeStorage, owner: string): WorkspaceRead {
  const id = ownerId(owner)
  try {
    const raw = storage.getItem(workspaceKey(id))
    if (raw === null) return { raw, value: { version: 1, ownerId: id, references: [], mappings: [] } }
    if (raw.length > 400000) throw new CanvaBridgeError('storage')
    const data = record(JSON.parse(raw))
    if (data.version !== 1 || data.ownerId !== id || !Array.isArray(data.references) || data.references.length > REFERENCE_LIMIT || !Array.isArray(data.mappings) || data.mappings.length > MAPPING_LIMIT) throw new CanvaBridgeError('storage')
    const references = data.references.map(reference), mappings = data.mappings.map(mapping)
    if (new Set(references.map(referenceKey)).size !== references.length || new Set(mappings.map(item => item.postId)).size !== mappings.length) throw new CanvaBridgeError('storage')
    return { raw, value: { version: 1, ownerId: id, references, mappings } }
  } catch { throw new CanvaBridgeError('storage') }
}
function writeWorkspace(storage: BridgeStorage, current: WorkspaceRead, next: CanvaWorkspace): WorkspaceRead {
  try {
    const key = workspaceKey(next.ownerId)
    if (storage.getItem(key) !== current.raw) throw new CanvaBridgeError('conflict')
    const raw = JSON.stringify(next)
    if (raw.length > 400000) throw new CanvaBridgeError('storage')
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw) throw new CanvaBridgeError('conflict')
    return readWorkspace(storage, next.ownerId)
  } catch (cause) { if (cause instanceof CanvaBridgeError) throw cause; throw new CanvaBridgeError('storage') }
}
export function saveReference(storage: BridgeStorage, owner: string, current: WorkspaceRead, item: CanvaReference): WorkspaceRead {
  if (current.value.ownerId !== ownerId(owner)) throw new CanvaBridgeError('sign_in')
  const valid = reference(item), key = referenceKey(valid), previous = current.value.references
  if (!previous.some(item => referenceKey(item) === key) && previous.length >= REFERENCE_LIMIT) throw new CanvaBridgeError('storage')
  const references = [valid, ...previous.filter(item => referenceKey(item) !== key)]
  return writeWorkspace(storage, current, { ...current.value, references })
}
function postSnapshot(post: Post): string {
  if (!scheduledPost(post) || !Array.isArray(post.hashtags) || (post.revision !== undefined && (!Number.isSafeInteger(post.revision) || post.revision < 0))) throw new CanvaBridgeError('post_changed')
  // Fixed keys include every existing Post field that can affect approval/media.
  return JSON.stringify([post.id, post.status, post.scheduledFor, post.revision ?? null, post.idea, post.platform, post.tone, post.caption, [...post.hashtags], post.createdAt, post.language ?? null, post.market ?? null, post.media ? [post.media.path, post.media.name, post.media.type, post.media.size] : null])
}
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('')
}
export async function postFingerprint(post: Post): Promise<string> { return fingerprint(postSnapshot(post)) }
export async function saveMapping(storage: BridgeStorage, owner: string, current: WorkspaceRead, selected: CanvaReference, postId: string, expectedFingerprint: string, getPosts: () => readonly Post[], now = new Date()): Promise<WorkspaceRead> {
  if (current.value.ownerId !== ownerId(owner)) throw new CanvaBridgeError('sign_in')
  const item = reference(selected), first = getPosts().find(post => post.id === postId)
  if (!scheduledPost(first) || await postFingerprint(first) !== expectedFingerprint) throw new CanvaBridgeError('post_changed')
  const latest = getPosts().find(post => post.id === postId)
  // Fingerprints run asynchronously; a subsequent render may have replaced it.
  if (!scheduledPost(latest)) throw new CanvaBridgeError('post_changed')
  const snapshot = postSnapshot(latest)
  if (await fingerprint(snapshot) !== expectedFingerprint) throw new CanvaBridgeError('post_changed')
  const last = getPosts().find(post => post.id === postId)
  if (!scheduledPost(last) || postSnapshot(last) !== snapshot) throw new CanvaBridgeError('post_changed')
  if (!current.value.mappings.some(item => item.postId === postId) && current.value.mappings.length >= MAPPING_LIMIT) throw new CanvaBridgeError('storage')
  const entry: CanvaPostMapping = { postId, postFingerprint: expectedFingerprint, scheduledFor: latest.scheduledFor, reference: item, linkedAt: timestamp(now.toISOString()) }
  return writeWorkspace(storage, current, { ...current.value, mappings: [entry, ...current.value.mappings.filter(row => row.postId !== postId)] })
}
export function removeMapping(storage: BridgeStorage, owner: string, current: WorkspaceRead, postId: string): WorkspaceRead {
  if (current.value.ownerId !== ownerId(owner)) throw new CanvaBridgeError('sign_in')
  return writeWorkspace(storage, current, { ...current.value, mappings: current.value.mappings.filter(item => item.postId !== postId) })
}
export async function mappingState(item: CanvaPostMapping, posts: readonly Post[]): Promise<'current' | 'changed' | 'missing'> {
  const post = posts.find(post => post.id === item.postId)
  if (!post) return 'missing'
  if (!scheduledPost(post)) return 'changed'
  return await postFingerprint(post) === item.postFingerprint ? 'current' : 'changed'
}
