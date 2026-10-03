import { supabase } from './supabase'
import type { PostMedia } from '../types'

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' }
export async function uploadMedia(file: File): Promise<PostMedia> {
  if (!supabase) throw new Error('Sign in to upload media. Uploads are unavailable in demo mode.')
  if (!extensions[file.type]) throw new Error('Choose a JPG, PNG, WebP or MP4 file.')
  if (file.size === 0 || file.size > 25 * 1024 * 1024) throw new Error('Choose a non-empty file smaller than 25 MB.')
  const { data, error: authError } = await supabase.auth.getUser()
  if (authError || !data.user) throw new Error('Please sign in again before uploading.')
  const path = `${data.user.id}/${crypto.randomUUID()}.${extensions[file.type]}`
  const { error } = await supabase.storage.from('post-media').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error('Upload failed. Check that media storage is configured and try again.')
  return { path, name: file.name, type: file.type, size: file.size }
}

export async function mediaPreview(media: PostMedia): Promise<string> {
  if (!supabase) throw new Error('Sign in to view this attachment.')
  const { data, error } = await supabase.storage.from('post-media').createSignedUrl(media.path, 300)
  if (error) throw new Error('The attachment could not be opened.')
  return data.signedUrl
}
