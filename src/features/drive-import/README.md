# Velo Google Drive media importer

This is a new, optional module. No existing application, Auth, database, RLS,
Storage bucket, dependency, security header or DarulIlm file is changed. It is
not mounted in the application and is disabled by default.

## Files

```text
src/features/drive-import/
  GoogleDriveImport.tsx      # Safe public component; configuration errors stay inside this panel
  DriveMediaImporter.tsx     # Browse, selection, explicit import, per-file results and cancellation
  google-picker.ts          # Official Google Identity Services + Picker, short-lived access in memory
  drive-content.ts          # Fixed Google GET URLs, bounded bytes, metadata/version/signature checks
  import-batch.ts           # Sequential imports, partial results, no automatic upload retries
  velo-target.ts            # Adapter to existing private uploadMedia; preserves the current Beta gate
  types.ts                  # Typed source/target contracts and 5-file/10-MiB/25-MiB limits
  labels.ts                 # Separate English and Arabic dictionary
  drive-import.css          # Styles scoped only to .velo-drive-import
  README.md
tests/drive-import.test.mjs
e2e/drive-import.spec.ts
e2e/fixtures/drive-import-harness.tsx
docs/DRIVE_IMPORT_CHECKPOINT_20261024.md
```

No new package is required. React 19, TypeScript and the existing Supabase media
code are reused. Do not run a database migration or install another Auth library.

## Optional mount example — not applied to any core file

After the separate site/configuration review, place this component in a new
feature slot. Pass the actual authenticated Velo user id; do not hardcode it.
The existing application remains unchanged in this delivery.

```tsx
import GoogleDriveImport from './features/drive-import/GoogleDriveImport'
import type { PickerConfig, ImportReceipt } from './features/drive-import/types'

// Supplied by the host's approved PUBLIC Google Picker configuration.
// These are not a Gemini key, OAuth client secret or Supabase service key.
const googlePickerConfig: PickerConfig = {
  clientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
  apiKey: 'YOUR_RESTRICTED_PICKER_BROWSER_KEY',
  projectNumber: 'YOUR_GOOGLE_CLOUD_PROJECT_NUMBER',
}

export function ProductMediaImport({ userId }: { userId: string }) {
  function received(receipts: readonly ImportReceipt[]) {
    // Optional: display these receipts or request the existing Media library to refresh.
    // Receipt.media is the existing Media shape. Do not modify posts/approval here.
    void receipts
  }
  return <GoogleDriveImport
    ownerId={userId}
    config={googlePickerConfig}
    locale="en" // "ar" provides Arabic and RTL
    enabled={false} // Keep off until the separate existing gates/configuration review.
    onImported={received}
  />
}
```

The placeholders intentionally do not make a connection. Do not paste real
credentials into this README/source. The browser Picker developer key is
intentionally public, unlike a Gemini/server key; it must have the approved
website/API restrictions. The existing broad frontend key scanner/policy has
not been weakened or bypassed. Review that public-key policy before activation.

## Google setup prerequisites

1. In the intended Google Cloud project, enable **Google Drive API** and **Google
   Picker API**. A 2 TB Google plan is source-account storage; it does not connect
   an app, increase Velo's private-storage allowance or bypass its media limits.
2. Create a **Web application OAuth client**, configure its exact frontend
   JavaScript origin and consent/test users. Use the public client id and the
   numeric **project number**, not a project name/id. This browser token flow
   uses Google Identity Services; it does not need a client secret in Velo.
3. Create a separate restricted **Picker browser API key**. Current Google docs
   require approved website referrers including the application and
   `https://docs.google.com/*` for the Picker iframe, plus the relevant Picker
   API restriction. Restrict the key; do not reuse a Gemini key.
4. The module asks only for `drive.file`, with `include_granted_scopes=false`.
   Google's own Picker browses the user's Drive; Velo reads only selected,
   app-authorized files. It does not list/download the entire Drive or modify
   originals, folders, permissions or sharing settings.
   Google's scope itself includes write capabilities; this module restricts its
   own Drive transport to GET-only operations rather than calling the scope read-only.
5. Load scripts only after **Prepare Google Picker**, then choose **Browse
   Google Drive**. The second click starts consent synchronously, so an async
   SDK load does not lose the user gesture. Popup denial, closure or expired
   access is a safe error; there is no silent account linking or token refresh.

This is a separate, short-lived browser token flow explicitly intended by
Google for Picker/REST/CORS. Its token stays in a private closure, never URL,
React state, browser storage or Velo upload payloads. No refresh token is
requested/stored. The previous asset backend's encrypted refresh tokens are
not reused or exposed. Closing/changing the panel's owner clears its access.

## Existing locks deliberately preserved

- `src/lib/beta-policy.ts` currently pauses uploads. The default adapter uses
  this same gate and the existing `uploadMedia`; it never bypasses either the
  client gate or server RLS. While paused, browsing/selection can be offered,
  but **Import selected files** remains disabled. Rejected imports stop before
  Google content download or Storage writes.
- The current production CSP permits self-hosted scripts and no frames; it
  blocks Google SDKs/Picker. The current COOP popup policy also needs review.
  No component can override HTTP security headers. A separately reviewed site
  release/configuration is required before a real Google dialog can work.
  Do not replace the existing CSP, add wildcards/unsafe-eval or remove protections
  just to make this panel appear connected.
- No hosted SQL/Auth change, deployment, provider request, paid activation or
  real upload was performed while developing this module. Actual Google
  consent, browser/header compatibility and authorized private Storage
  acceptance remain unverified.

## Import behavior

- Choose up to five files. The module fetches bounded metadata and displays
  authoritative names/sizes before the **Import** click. Selection never uploads.
- The existing maximum is 10 MiB/file; the module adds a 25 MiB/batch cap. It
  supports exactly the current JPEG/PNG/WebP, MP4/WebM and audio formats. It
  rejects folders, shortcuts, Docs exports, SVG, PDF and unsupported formats.
- Before and after the content read, it checks the exact id/version/modified
  time/size/type and download/app permission. Changed files are rejected. It
  verifies SHA-256 when Drive supplies one, always records a content SHA-256
  in the result, and reuses the existing media container-header checks. These
  checks are not full codec decoding or malware scanning.
- The default adapter verifies the current Velo owner/session and reuses
  `uploadMedia(ownerId, file)` into the existing private `post-media` bucket.
  It never uses public URLs, service credentials, overwrite/upsert or deletes.
  The existing server owner/session/file-count policies remain authoritative.
- Imports run sequentially. Confirmed files stay saved if a later file fails.
  The panel does not change posts, approval, schedules or publishing. Refresh
  the existing Media library to see imported files.
- Cancellation stops remaining work. An upload already sent through the
  existing uploader cannot be promised aborted; its result is recorded if it
  completes. A timeout/unknown upload blocks retries and tells the user to
  inspect the Media library first. No automatic rollback/delete is attempted.
- Confirmed id/version pairs are deduplicated while this panel stays mounted.
  There is no durable import ledger/exactly-once guarantee across reloads:
  that would require a separate reviewed persistence contract. Changing the
  Velo owner/source remounts the panel and clears its previous selection.
- The outer panel is responsive and has English/Arabic labels. Google's own
  dialog is third-party UI; its documented desktop minimum is 566×350. Actual
  narrow-phone behavior must be accepted with the real configured Google UI;
  synthetic screenshots do not prove vendor dialog compatibility.

## Tests

```sh
node --test tests/drive-import.test.mjs
npm run test:e2e -- e2e/drive-import.spec.ts
npm run lint
npm run check:e2e
npm run build
npm run review:beta
```

The new Node tests are picked up by the existing `npm test`; the browser spec
is picked up by the existing Playwright discovery. The test-only harness uses
synthetic sources/targets and blocks every request outside localhost. It is
not imported into the application. Neither a passing mocked test nor a green
CI is a claim of a live Drive/Storage connection.

Official references checked on 24 October 2026:

- https://developers.google.com/workspace/drive/picker/guides/web-picker
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/identity/oauth2/web/reference/js-reference
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files
- https://supabase.com/docs/guides/storage/uploads/standard-uploads
