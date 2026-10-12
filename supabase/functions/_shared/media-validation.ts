import { mediaSignatureMatches } from './media-signature.ts'

export const mediaFormats: Record<string, { extension: string; max: number }> = {
  'image/jpeg': { extension: 'jpg', max: 10 * 1024 * 1024 },
  'image/png': { extension: 'png', max: 10 * 1024 * 1024 },
  'image/webp': { extension: 'webp', max: 10 * 1024 * 1024 },
  'video/mp4': { extension: 'mp4', max: 10 * 1024 * 1024 },
  'audio/webm': { extension: 'webm', max: 10 * 1024 * 1024 },
  'audio/mp4': { extension: 'm4a', max: 10 * 1024 * 1024 },
  'audio/mpeg': { extension: 'mp3', max: 10 * 1024 * 1024 },
  'audio/wav': { extension: 'wav', max: 10 * 1024 * 1024 },
  'audio/ogg': { extension: 'ogg', max: 10 * 1024 * 1024 },
  'video/webm': { extension: 'webm', max: 10 * 1024 * 1024 },
}
export function matchesMediaHeader(type: string, header: Uint8Array): boolean { return mediaSignatureMatches(header, type) }
