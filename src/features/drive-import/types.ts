import type { Media } from '../../types.ts'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const IMPORT_LIMITS = Object.freeze({ files: 5, fileBytes: 10 * 1024 * 1024, batchBytes: 25 * 1024 * 1024 })
export interface PickerConfig { clientId: string; apiKey: string; projectNumber: string; locale?: 'en' | 'ar' }
export interface PickedDriveFile { id: string; resourceKey?: string }
export interface DriveSnapshot extends PickedDriveFile { name: string; mimeType: string; bytes: number; version: string; modifiedTime: string; sha256?: string }
export interface VerifiedDriveFile { file: File; snapshot: DriveSnapshot; sha256: string }
export interface DriveSource {
  /** A new id for every independently authorized source instance. */
  id: string
  prepare(signal: AbortSignal): Promise<void>
  /** Call directly from the Browse button's user gesture, after prepare. */
  pick(signal: AbortSignal): Promise<PickedDriveFile[]>
  inspect(files: readonly PickedDriveFile[], signal: AbortSignal): Promise<DriveSnapshot[]>
  download(snapshot: DriveSnapshot, signal: AbortSignal): Promise<VerifiedDriveFile>
  clear(): void
}
export interface ImportTarget {
  isEnabled(): boolean
  assertReady(ownerId: string): Promise<void>
  upload(ownerId: string, file: File): Promise<Media>
}
export type ImportState = 'selected' | 'downloading' | 'uploading' | 'imported' | 'failed' | 'cancelled' | 'unconfirmed'
export interface ImportReceipt { driveId: string; driveVersion: string; sha256: string; media: Media }
export interface ImportItem { snapshot: DriveSnapshot; state: ImportState; error?: DriveImportCode; receipt?: ImportReceipt }
export type DriveImportCode = 'setup' | 'sdk' | 'consent' | 'expired' | 'selection' | 'unsupported' | 'size' | 'changed' | 'download' | 'paused' | 'signin' | 'cancelled' | 'unconfirmed'
export class DriveImportError extends Error { code: DriveImportCode; constructor(code: DriveImportCode) { super(code); this.code = code } }
export function checkAbort(signal: AbortSignal) { if (signal.aborted) throw new DriveImportError('cancelled') }
export const validOwner = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
