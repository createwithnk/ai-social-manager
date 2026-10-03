import { useEffect, useRef, useState } from 'react'
import { uploadMedia, mediaUrl, mediaTypes } from '../lib/media'
import type { Media } from '../types'
export function MediaPreview({ media }: { media: Media }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { let active = true; mediaUrl(media).then(value => { if (active) setUrl(value) }).catch(() => { if (active) setError('Preview unavailable. Reopen this post to retry.') }); return () => { active = false } }, [media])
  return <div className="media-preview"><p>{media.name}</p>{error && <p role="alert">{error}</p>}{url && (media.type.startsWith('image/') ? <img src={url} alt={media.name} /> : media.type.startsWith('video/') ? <video src={url} controls /> : <audio src={url} controls />)}</div>
}
export function MediaInput({ media, onChange, disabled, onBusy }: { media?: Media; onChange: (value?: Media) => void; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false; clearTimeout(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()) } }, [])
  async function upload(file: File) {
    onBusy(true); setError('')
    try { const value = await uploadMedia(file); if (active.current) onChange(value) } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Upload failed.') } finally { if (active.current) onBusy(false) }
  }
  async function record() {
    setError(''); onBusy(true)
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!active.current) { input.getTracks().forEach(t => t.stop()); return }
      stream.current = input
      const rec = new MediaRecorder(input); recorder.current = rec
      const chunks: Blob[] = []
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      rec.onstop = () => { clearTimeout(timer.current); input.getTracks().forEach(t => t.stop()); if (!active.current) return; setRecording(false); void upload(new File(chunks, 'voice-note', { type: rec.mimeType })) }
      rec.start(); setRecording(true); timer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop() }, 60000)
    } catch { setError('Microphone unavailable. Allow microphone access or upload an audio file.'); onBusy(false) }
  }
  return <div className="media-input"><label>Photo, video or voice note (up to 10 MB)<input type="file" accept={mediaTypes.join(',')} disabled={disabled || recording} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }} /></label>{recording ? <button className="ghost" onClick={() => recorder.current?.stop()}>Stop recording</button> : <button className="ghost" disabled={disabled} onClick={() => { void record() }}>Record voice (up to 60 seconds)</button>}{media && <><MediaPreview key={media.path} media={media} /><button className="ghost" disabled={disabled || recording} onClick={() => onChange(undefined)}>Remove attachment</button></>}{error && <p role="alert" className="form-error">{error}</p>}</div>
}
