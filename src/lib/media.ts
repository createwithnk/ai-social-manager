import { supabase } from './supabase'
import type { Media } from '../types'
import { mediaSignatureMatches } from '../../supabase/functions/_shared/media-signature'
export const mediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']
export async function uploadMedia(file: File): Promise<Media> {
  if (!supabase) throw new Error('Sign in with a configured account to upload files.')
  const mime = file.type.split(';')[0]
  if (!mediaTypes.includes(mime) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Use a supported image, video or audio file up to 10 MB.')
  if (!mediaSignatureMatches(new Uint8Array(await file.slice(0,16).arrayBuffer()),mime)) throw new Error('The file contents do not match its type. Export a supported media file and retry.')
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Please sign in again.')
  const path = `${user.id}/${crypto.randomUUID()}`
  // Multipart uses the File's own MIME, which can include recorder codec
  // parameters. Normalize the part too, to match the private bucket allowlist.
  const normalized = new File([file],file.name,{type:mime})
  const { error } = await supabase.storage.from('post-media').upload(path, normalized, { contentType: mime, upsert: false })
  if (error) throw error
  return { path, name: file.name.slice(0,200), type: mime, size: file.size }
}
export async function mediaUrl(media: Media) {
  if (!supabase) throw new Error('Storage is not connected.')
  const { data, error } = await supabase.storage.from('post-media').createSignedUrl(media.path, 300)
  if (error) throw error
  return data.signedUrl
}
