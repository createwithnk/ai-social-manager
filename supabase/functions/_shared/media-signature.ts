// This checks container signatures, not codecs, duration or media safety.
// Publishing adapters and the provider still validate dimensions/codecs.
export function mediaSignatureMatches(bytes:Uint8Array, mime:string) {
  const prefix = (values:number[]) => values.every((value,index) => bytes[index] === value)
  const ascii = (offset:number,value:string) => [...value].every((c,index) => bytes[offset + index] === c.charCodeAt(0))
  if (mime === 'image/jpeg') return prefix([255,216,255])
  if (mime === 'image/png') return prefix([137,80,78,71,13,10,26,10])
  if (mime === 'image/webp') return ascii(0,'RIFF') && ascii(8,'WEBP')
  if (mime === 'video/mp4' || mime === 'audio/mp4') return ascii(4,'ftyp')
  if (mime === 'video/webm' || mime === 'audio/webm') return prefix([26,69,223,163])
  if (mime === 'audio/wav') return ascii(0,'RIFF') && ascii(8,'WAVE')
  if (mime === 'audio/ogg') return ascii(0,'OggS')
  if (mime === 'audio/mpeg') return ascii(0,'ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)
  return false
}
