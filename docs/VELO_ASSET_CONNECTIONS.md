# Velo asset connections — 24 October 2026

This is development source and a review proposal, not an activated integration. Only `createwithnk/ai-social-manager`, branch `fix/beta-readiness-20261019`, and Supabase `nkfecpdegcmsapvbviky` are in scope. No provider request, real consent, hosted SQL/Auth change, deployment, main merge or public launch was performed.

## What this increment adds

- Two separate Edge entrypoints: `velo-asset-account` for verified signed-in actions and `velo-asset-callback` for the OAuth redirect. Existing handlers/Auth/posts/media/layouts are unchanged.
- Canva/Google authorization-code + S256 PKCE, unique 256-bit state, encrypted verifier and server-only encrypted access/refresh tokens. The callback is fixed; no user-supplied redirect destination is accepted. The original active session and Beta membership must still exist when state is consumed and when credentials are saved. An older flow cannot overwrite a newer generation.
- Canva token introspection verifies the app client, active scope and account identity; expiry uses the earlier introspection/token deadline. Drive uses only `drive.file` and reads the stable permission id from `about`, not an editable email/name. Refresh cannot silently switch accounts.
- Fixed host/path/method transports with byte/time limits, redirects disabled and no automatic retries. Only OAuth token/introspection and selected design/file metadata operations exist. No exports, uploads, file edits/deletes, permission changes or publishing endpoints are allowed.
- A separate private SQL proposal with RLS-closed tables, service-only RPC, default-off database switch, one-use states, three pending flows, 10 OAuth starts and 100 metadata reservations per owner per UTC day. The service derives user/session ids from verified Auth, never browser JSON. Direct table reads are denied even to the runtime service role.
- An exclusive refresh/read lease. A failed or ambiguous refresh requires fresh consent. A lost save or process crash leaves the lease blocked; it is never stolen to retry an old potentially single-use refresh token. A new OAuth generation supersedes the stuck lease. A successfully rotated token is saved even if the subsequent metadata read fails.
- A small mobile/Arabic connection panel mounted only when the public UI switch is explicitly enabled. It provides consent links, status, metadata checks and local credential removal. It stores no grants in browser storage and never accepts passwords/API keys. The existing bookmark/CSV tools work with the switch off.

Removing a Velo connection clears its local encrypted credentials; it is **not** a claim that Google/Canva revoked their grant. Remaining permissions are managed in the provider account. Disconnection/status remain available when the runtime read/start switch or the database switch is paused, provided the scoped runtime configuration and signed-in owner session still exist.

## What remains outside this increment

Google Picker/selected-file onboarding is **not yet implemented**. `drive.file` does not authorize every file in a 2 TB Drive: a pasted viewer link alone grants nothing. Metadata checks work only for files already authorized to this app. No Drive bytes are imported or synchronized; this is not a CDN or customer storage entitlement.

Canva Bulk Create still uses the existing manual CSV export. Automatic template population/Autofill, asynchronous export jobs, media revision approval, download type/size verification and cross-device asset-library sync need a later additive implementation. A Canva Pro subscription is not an OAuth registration or account consent.

The five publisher previews and WhatsApp sample filter are unchanged and remain inactive for real posting/messages. This asset increment does not expand the existing post platform union, queues, social credentials or customer inbox.

## Owner setup, possible from a mobile browser

These steps are a review checklist, not authorization to execute held hosted changes. Credentials must go directly into the correct provider/Supabase secret screens, never chat, Git or `VITE_` fields.

1. Obtain actual AasiFlowAI-scoped hosted backup inventory/recovery evidence through `HOSTED_BACKUP_REVIEW.md`. `AASIFLOW_SUPABASE_READ_TOKEN` is absent in this run and the connector has no backup-list action; availability remains unknown. Review the existing canonical/Beta SQL prerequisites and this exact new proposal before any hosted SQL work.
2. In the Canva Developer Portal register a Connect integration and authorize only `design:meta:read` for this first metadata stage. Set its redirect URL exactly to `https://nkfecpdegcmsapvbviky.supabase.co/functions/v1/velo-asset-callback`. Retain the client id/secret in the server secret store. Do not reuse the Gemini API key.
3. In the intended Google Cloud project enable Drive API, configure the OAuth consent audience/test users and create a Web application OAuth client with the same exact redirect URL. Request only `https://www.googleapis.com/auth/drive.file`. A Gemini API key/project id is not an OAuth client secret. Google Picker authorization for arbitrary existing files remains a separate prerequisite before claiming file selection/import works.
4. Choose the reviewed private Velo frontend HTTPS origin. Set only the following task-scoped server values in **this** Supabase project's Edge Function secrets:

   | Server name | Purpose |
   | --- | --- |
   | `AASIFLOW_ASSET_APP_URL` | Exact reviewed HTTPS frontend root, no query/path |
   | `AASIFLOW_ASSET_TOKEN_KEY` | Independently generated, base64-encoded 32 random bytes for AES-GCM |
   | `AASIFLOW_CANVA_CLIENT_ID` / `AASIFLOW_CANVA_CLIENT_SECRET` | Intended Canva integration |
   | `AASIFLOW_DRIVE_CLIENT_ID` / `AASIFLOW_DRIVE_CLIENT_SECRET` | Intended Google Web OAuth client |
   | `AASIFLOW_ASSET_CONNECTIONS_ENABLED` | Leave `false` until separately approved acceptance |

   Each provider is optional, but partial/malformed credentials fail closed. Runtime-reserved Supabase public/service keys are read only after verifying the exact project URL; generic Google, Gemini or other-project credentials are never substituted. Keep the encryption key stable; loss/change requires fresh consent rather than decrypting old grants.
5. After separate approval, apply **only** the exact reviewed `supabase/proposals/velo_asset_connections.sql` to the verified project, with the Beta prerequisites already in place. It creates new private objects and starts disabled. It is not in automatic migrations; do not use a blanket `db push`. The reviewed pause file only sets this new database switch false and preserves all records.
6. After a separately approved private runtime release, configure the signed-in account function to require an authenticated bearer at the gateway. The GET callback needs gateway JWT verification disabled for **that callback only**, because providers do not send a Supabase bearer; the handler's one-use state and original session checks remain mandatory. Do not change existing function JWT/Auth settings. Review platform OAuth-request logging/retention; this source writes no application logs.
7. Only after runtime/database/provider/no-charge acceptance is authorized, enable this module's database switch and server switch. Add `VITE_VELO_ASSET_CONNECTIONS=true` to the reviewed frontend release only; it is a public UI switch, not a secret or server authorization. The account panel is hidden by default and the frontend caller checks the exact Supabase project URL.
8. The owner opens **Velo tools → Asset bridge → Connect**, then follows **Continue to provider consent** using their own account. No password/token is pasted into Velo. Returning to Velo and refreshing connections must show actual server status. Do not treat the redirect query as proof of success.

If setup/access is still unavailable, keep the switches off and preserve the source/checkpoint. Do not deploy or use unrelated credentials to make the panel appear connected.

## Verification and next safe step

Read `docs/evidence/velo-asset-connections-20261024.json` for exact local results and limitations, then inspect the current development head's CI. Synthetic tests cover protocol endpoints, scope/account mismatches, expired/replayed/revoked flows, encrypted owner contexts, interrupted refresh/save behavior, quota/lease ownership, private grants and core preservation. Browser fixtures intercept only this new transport; all external requests are blocked. Native CI additionally tests overlapping independent leases and synthetic restore, not an actual hosted backup.

The next live prerequisite is the correct scoped app configuration plus actual hosted recovery evidence and separate held-action approval. Until then, account consent and provider acceptance remain unverified; neither a green CI nor a repository plan proves a live integration.

Official references checked for this implementation:

- https://www.canva.dev/docs/apps/rest-apis/authentication/
- https://www.canva.dev/docs/apps/rest-apis/reference/authentication/generate-access-token/
- https://www.canva.dev/docs/apps/rest-apis/reference/authentication/introspect-access-token/
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://googleapis.dev/nodejs/google-auth-library/latest/classes/OAuth2Client.html
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get
- https://supabase.com/docs/guides/database/functions
