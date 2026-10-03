import { supabase } from './supabase'
import type { Media } from '../types'
export const mediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']
export async function uploadMedia(file: File): Promise<Media> {
  if (!supabase) throw new Error('Sign in with a configured account to upload files.')
  const mime = file.type.split(';')[0]
  if (!mediaTypes.includes(mime) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Use a supported image, video or audio file up to 10 MB.')
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Please sign in again.')
  const path = `${user.id}/${crypto.randomUUID()}`
  const { error } = await supabase.storage.from('post-media').upload(path, file, { contentType: mime, upsert: false })
  if (error) throw error
  return { path, name: file.name, type: mime, size: file.size }
}
export async function mediaUrl(media: Media) {
  if (!supabase) throw new Error('Storage is not connected.')
  const { data, error } = await supabase.storage.from('post-media').createSignedUrl(media.path, 3600)
  if (error) throw error
  return data.signedUrl
}
