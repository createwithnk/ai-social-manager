export const mediaFormats: Record<string, { extension: string; max: number }> = {
  'image/jpeg': { extension: 'jpg', max: 10 * 1024 * 1024 },
  'image/png': { extension: 'png', max: 10 * 1024 * 1024 },
  'image/webp': { extension: 'webp', max: 10 * 1024 * 1024 },
  'video/mp4': { extension: 'mp4', max: 50 * 1024 * 1024 },
  'video/webm': { extension: 'webm', max: 50 * 1024 * 1024 },
}
export function matchesMediaHeader(type: string, header: Uint8Array): boolean {
  const matches = (bytes: number[], offset = 0) => bytes.every((byte, index) => header[offset + index] === byte)
  return type === 'image/jpeg' ? matches([0xff, 0xd8, 0xff])
    : type === 'image/png' ? matches([137, 80, 78, 71, 13, 10, 26, 10])
    : type === 'image/webp' ? matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8)
    : type === 'video/mp4' ? matches([102, 116, 121, 112], 4)
    : type === 'video/webm' ? matches([26, 69, 223, 163]) : false
}
