import { supabase } from './supabase'
import type { Media } from '../types'
import { matchesMediaHeader, mediaFormats } from '../../supabase/functions/_shared/media-validation'

export interface MediaItem extends Media { url: string; kind: 'image' | 'video' | 'audio' }
export const MEDIA_BUCKET = 'post-media'
const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/

export async function validateMedia(file: File): Promise<string> {
  const type = file.type.split(';')[0]
  const format = Object.hasOwn(mediaFormats, type) ? mediaFormats[type] : undefined
  if (!format) throw new Error('Choose a supported image, video, or audio file.')
  if (!file.size || file.size > format.max) throw new Error('Media must be at most 10 MiB.')
  if (!matchesMediaHeader(type, new Uint8Array(await file.slice(0, 16).arrayBuffer()))) throw new Error('File contents do not match the selected media type.')
  return format.extension
}
async function clientForUser(userId: string) {
  if (!supabase || !/^[\da-f-]{36}$/i.test(userId)) throw new Error('Sign in to manage private media.')
  const { data, error } = await supabase.auth.getUser()
  if (error || data.user?.id !== userId) throw new Error('Your session expired. Sign in again.')
  const { data: active, error: sessionError } = await supabase.rpc('has_active_session')
  if (sessionError || active !== true) throw new Error('Your session expired. Sign in again.')
  return supabase.storage.from(MEDIA_BUCKET)
}
export async function listMedia(userId: string): Promise<MediaItem[]> {
  const bucket = await clientForUser(userId)
  const { data, error } = await bucket.list(userId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw new Error('Media could not be loaded. Check the storage setup and retry.')
  return Promise.all((data ?? []).filter(file => file.id && safeName.test(file.name) && Object.hasOwn(mediaFormats, file.metadata?.mimetype ?? '')).map(async file => {
    const path = `${userId}/${file.name}`
    const { data, error } = await bucket.createSignedUrl(path, 300)
    if (error || !data?.signedUrl) throw new Error('Private previews could not be loaded. Retry to refresh them.')
    const type: string = file.metadata!.mimetype
    return { path, name: file.name, type, size: Number(file.metadata!.size) || 0, url: data.signedUrl, kind: type.startsWith('video/') ? 'video' as const : type.startsWith('audio/') ? 'audio' as const : 'image' as const }
  }))
}
export async function uploadMedia(userId: string, file: File): Promise<Media> {
  await validateMedia(file)
  const bucket = await clientForUser(userId)
  const type = file.type.split(';')[0]
  const path = `${userId}/${crypto.randomUUID()}`
  const normalized = new File([file], file.name, { type })
  // Existing private Storage policies enforce the authenticated owner, active
  // session and serialized object-count limits. Never upsert an existing object.
  const { error } = await bucket.upload(path, normalized, { contentType: type, upsert: false })
  if (error) throw new Error('Upload failed. Check your connection and the media size, then retry.')
  return { path, name: file.name.slice(0,200), type, size: file.size }
}
// The live post-media bucket has no client DELETE policy. Never claim deletion
// succeeded or add a bypass using service credentials in the frontend.
export async function deleteMedia(_userId: string, _path: string): Promise<void> {
  void _userId; void _path
  throw new Error('Media deletion is not enabled by the existing storage policy.')
}

export const mediaTypes = Object.keys(mediaFormats)
export async function mediaUrl(media: Media): Promise<string> {
  const [userId, name, extra] = media.path.split('/')
  if (!name || extra || !safeName.test(name)) throw new Error('Invalid media selection.')
  const bucket = await clientForUser(userId)
  const { data, error } = await bucket.createSignedUrl(media.path, 300)
  if (error || !data?.signedUrl) throw new Error('Private previews could not be loaded. Retry to refresh them.')
  return data.signedUrl
}
