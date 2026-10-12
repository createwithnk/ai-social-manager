import { supabase } from './supabase'

export interface MediaItem { path: string; name: string; url: string; kind: 'image' | 'video' }
export const MEDIA_BUCKET = 'aasiflow-media'
const types: Record<string, { extension: string; max: number }> = {
  'image/jpeg': { extension: 'jpg', max: 10 * 1024 * 1024 },
  'image/png': { extension: 'png', max: 10 * 1024 * 1024 },
  'image/webp': { extension: 'webp', max: 10 * 1024 * 1024 },
  'video/mp4': { extension: 'mp4', max: 50 * 1024 * 1024 },
  'video/webm': { extension: 'webm', max: 50 * 1024 * 1024 },
}

export async function validateMedia(file: File): Promise<string> {
  const format = types[file.type]
  if (!format) throw new Error('Choose a JPEG, PNG, WebP, MP4, or WebM file.')
  if (!file.size || file.size > format.max) throw new Error('Images must be at most 10 MiB and videos at most 50 MiB.')
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const matches = (bytes: number[], offset = 0) => bytes.every((byte, index) => header[offset + index] === byte)
  const valid = file.type === 'image/jpeg' ? matches([0xff, 0xd8, 0xff])
    : file.type === 'image/png' ? matches([137, 80, 78, 71, 13, 10, 26, 10])
    : file.type === 'image/webp' ? matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8)
    : file.type === 'video/mp4' ? matches([102, 116, 121, 112], 4)
    : matches([26, 69, 223, 163])
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
  const extension = await validateMedia(file)
  const bucket = await clientForUser(userId)
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false, cacheControl: '300' })
  if (error) throw new Error('Upload failed. Check your connection and the media size, then retry.')
}

export async function deleteMedia(userId: string, path: string): Promise<void> {
  if (!path.startsWith(`${userId}/`) || path.includes('..') || path.slice(userId.length + 1).includes('/')) throw new Error('Invalid media selection.')
  const bucket = await clientForUser(userId)
  const { error } = await bucket.remove([path])
  if (error) throw new Error('Media could not be deleted. Please retry.')
}
