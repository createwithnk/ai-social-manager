import { supabase } from './supabase'
import { matchesMediaHeader, mediaFormats } from '../../supabase/functions/_shared/media-validation'

export interface MediaItem { path: string; name: string; url: string; kind: 'image' | 'video' }
export const MEDIA_BUCKET = 'aasiflow-media'

export async function validateMedia(file: File): Promise<string> {
  const format = Object.hasOwn(mediaFormats, file.type) ? mediaFormats[file.type] : undefined
  if (!format) throw new Error('Choose a JPEG, PNG, WebP, MP4, or WebM file.')
  if (!file.size || file.size > format.max) throw new Error('Images must be at most 10 MiB and videos at most 50 MiB.')
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const valid = matchesMediaHeader(file.type, header)
  if (!valid) throw new Error('File contents do not match the selected media type.')
  return format.extension
}

async function clientForUser(userId: string) {
  if (!supabase || !/^[\da-f-]{36}$/i.test(userId)) throw new Error('Sign in to manage private media.')
  const { data, error } = await supabase.auth.getUser()
  if (error || data.user?.id !== userId) throw new Error('Your session expired. Sign in again.')
  return supabase.storage.from(MEDIA_BUCKET)
}

export async function listMedia(userId: string): Promise<MediaItem[]> {
  const bucket = await clientForUser(userId)
  const { data, error } = await bucket.list(userId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw new Error('Media could not be loaded. Check the storage setup and retry.')
  return Promise.all((data ?? []).filter((file) => file.id && /^[\da-f-]+\.(jpg|png|webp|mp4|webm)$/i.test(file.name)).map(async (file) => {
    const path = `${userId}/${file.name}`
    const { data, error } = await bucket.createSignedUrl(path, 300)
    if (error || !data?.signedUrl) throw new Error('Private previews could not be loaded. Retry to refresh them.')
    return { path, name: file.name, url: data.signedUrl, kind: /\.(mp4|webm)$/.test(file.name) ? 'video' as const : 'image' as const }
  }))
}

export async function uploadMedia(userId: string, file: File): Promise<void> {
  await validateMedia(file)
  await clientForUser(userId)
  if (!supabase) throw new Error('Sign in to upload media.')
  const { data, error } = await supabase.functions.invoke('upload-media', { body: file, headers: { 'Content-Type': file.type } })
  if (error?.context?.status === 429) throw new Error('Daily upload or storage limit reached. Delete unused media or try tomorrow.')
  if (error?.context?.status === 503) throw new Error('Upload service unavailable or tracking delayed. Refresh your library before retrying.')
  if (error) throw new Error('Upload failed. Check your connection and the media size, then retry.')
  if (typeof data?.path !== 'string' || !data.path.startsWith(`${userId}/`)) throw new Error('Upload response was invalid. Refresh your media library.')
}

export async function deleteMedia(userId: string, path: string): Promise<void> {
  if (!path.startsWith(`${userId}/`) || path.includes('..') || path.slice(userId.length + 1).includes('/')) throw new Error('Invalid media selection.')
  const bucket = await clientForUser(userId)
  const { error } = await bucket.remove([path])
  if (error) throw new Error('Media could not be deleted. Please retry.')
}
