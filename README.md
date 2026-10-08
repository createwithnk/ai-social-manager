# AasiFlowAI

A review-first social content workspace. **Website/social publication and payment activation remain blocked pending owner permission.**

| Area | Status on 8 October 2026 |
| --- | --- |
| Supabase email login, drafts, private media and text/image Gemini backend | AI function v3 deployed; 21 live AI/Auth safety checks passed on 8 October; real text/image generation passed on 6 October |
| Password confirmation/recovery, PKCE and global logout UI | Implemented; hosted minimum 12 saved and short-password rejection verified; email flows browser tested with mocked Auth |
| Active-session RLS, storage/draft quotas and post revisions | Applied; live ownership/session rollback checks passed |
| Instagram/LinkedIn connections, encrypted tokens and approval-bound publishing queue | Account/callback functions v2 deployed; queue lock fix applied and 17 isolated native concurrency checks passed; official app settings pending and worker undeployed |
| Real metrics and observed posting-time suggestions | Implemented; no fabricated data; live platform checks pending |
| Hosted payment links, verified events, credit accounting and refund reconciliation | Checkout/webhook functions v2 deployed with collection disabled; live rollback accounting passed; merchant/provider integration pending |
| Production security headers | Generated; hosting/domain configuration and deployment still pending |

Five server functions are active: `generate-content` at version 3, and `social-account`, `social-callback`, `payment-checkout` and `payment-webhook` at version 2. Their deployed dependency files were read back and matched the reviewed source. The publication worker is **not deployed or scheduled**. The original 1 Auth user and 1 post are preserved. The version 3 live test left one disabled disposable Auth account and its exhausted quota row after two plugin DELETE requests expired; it has no active sessions and cannot sign in. Total Auth users are currently 2. See `tests/pending-fixture-cleanup-2026-10-08.json`; the owner chose to retain this disabled fixture for further tests and delegated cleanup when appropriate. Local tests can continue; remove it when no longer needed and before public launch. Payment/queue/connection data is empty, and both DB launch gates are false. No website or social content was published, and no merchant keys or transaction were added.

## Workspace

- Responsive dashboard, drafts, editable content, explicit approval and a planning calendar.
- English/Hindi/Urdu/Arabic AI briefs; clearly labelled English local templates.
- Private image/video/audio uploads, signed previews and browser recording with a 60-second cap. File signatures/MIME/size/owner paths are checked; recorder multipart MIME is normalized.
- Saved post revisions prevent lost updates through the applied migration. Editing approved/scheduled content clears approval and its plan.
- The Connections & setup screen displays actual configuration and gates. No API secret is entered in the browser.
- Instagram adapter: official Meta/Facebook Login, exactly one authorized Facebook Page linked to a professional Instagram account, JPEG photo/MP4 Reel publishing.
- LinkedIn adapter: personal-profile OAuth, text/JPEG/PNG/MP4 posts using the modern Posts, Images and Videos APIs; chunk ranges/ETags are handled for video upload.
- OAuth state is single-use and session-bound; credentials use authenticated AES-256-GCM encryption on the server. Expiration fails closed and requires reconnect.
- A publication is a separate explicit action from calendar planning. The queued snapshot must match the approved revision/account. Editing cancels queued work. Processing content is locked against edits.
- Worker claims have leases; final-request ambiguity and lost leases require human reconciliation. No automatic retry can duplicate an uncertain publication.
- Metrics come from official APIs. Instagram currently supplies likes/comments; unavailable impressions/shares remain null. LinkedIn requires approved `r_member_postAnalytics` for its metrics.
- Posting-time observations require at least 10 comparable posts measured near 24 hours, with 3 samples in each compared hour. They describe past results, not a guarantee.
- Billing is prepared for one-off, owner-priced AI-attempt credit purchases using hosted Razorpay payment links. No subscription/autopay, card/UPI storage or automatic refund initiation is implemented.

## Run and test locally

Node 24 and npm are used. The local template demo needs no environment values:

```bash
npm ci
npm run dev
npm run build
npm run lint
npm test
npm run check:edge
npm run test:edge
npx playwright install chromium
npm run test:browser
```

Edge checks use pinned Deno 2.9.6; the server Supabase client is pinned to 2.112.4. Browser tests start isolated local servers on ports 5177/5178 and intercept every nonlocal application request. They send no real email, social API request or payment. If Chromium is installed separately, set `CHROMIUM_EXECUTABLE` for the browser test.

For the connected setup, only `VITE_SUPABASE_URL` and its public publishable/anon key belong in an untracked frontend `.env`; see `.env.example`. Provider credentials, token encryption and worker/payment keys are **server-only**; the empty configuration reference is `supabase/server-env.example`.

`npm run build` prepares `public/_headers` and `deployment/security-headers.json` for the configured HTTPS Supabase origin. The eventual host must apply the headers and serve SPA routes; this script does not configure hosting or deploy anything. System fonts avoid external font requests.

## Verification

- `tests/database.mjs`: 71 sequential PGlite checks, including the baseline rollback suite, cross-user/anonymous denial, signed-out session rejection, immutable ownership/revisions, approval changes, dual-gate DB checks, job leases, OAuth replay/expiry, read-only metadata, payment replay/amount verification, credit debits/refunds and storage/draft quotas. All ordered migrations, including the queue lock fix, are loaded.
- `tests/native-postgres-concurrency.mjs`: 17 checks on a disposable PostgreSQL 17.10 cluster using 24 independent user connections and overlapping worker transactions. Claims skip editing posts, two workers claim distinct jobs, expired leases remain uncertain, OAuth state is consumed once, duplicate paid/refund events reconcile once, and concurrent AI/media metadata requests preserve their quotas. Auth/Storage catalogs are modeled. The standard GitHub Actions runner used no production secrets, provider calls or deployments; its socket-only cluster was stopped and removed. See `tests/native-postgres-concurrency-2026-10-08.json` and `.github/workflows/database-concurrency.yml`.
- `tests/security.test.ts`: 23 Deno tests covering encryption/tampering, request limits, redirect/host validation, OAuth scopes/identity, provider publish/upload flows, uncertain outcomes, null analytics, hosted checkout, raw-byte HMAC, merchant/captured-payment/refund validation, and fail-closed launch gates.
- `tests/payment-endpoints.test.ts`: actual checkout/webhook handlers with intercepted Auth/database/provider HTTP; 15 request-flow checks cover closed gates, revoked sessions, client price/credit/owner tampering, forged events, verified refund routing, uncertain provider responses and missing/invalid website configuration before any order or provider request.
- 10 client/workflow unit tests plus 30 generation-handler scenarios passed. The AI handler checks active sessions, bounded streamed input, media signatures/ownership, quota and provider output, with provider HTTP intercepted. Version 3 limits provider JSON to 128 KiB of actual streamed bytes, cancels oversize/error responses and returns safe 502 errors for malformed or interrupted provider content. UTF-8 and dishonest/missing length headers are covered; no automatic provider retry is added.
- 21 actual AI/Auth HTTP checks passed on version 3: two fixture sessions, global logout revoking both old tokens, 21 simultaneous quota calls allowing exactly 20, and denial of a new login after the pending-cleanup fixture was disabled. No model call was requested. Earlier version 2 evidence is retained in its original report.
- 12 actual account/payment safety HTTP checks passed: unauthenticated access denied, missing social setup blocked, both payment routes blocked by closed billing controls, missing OAuth state rejected and old account-metadata tokens rejected after logout. These are closed-gate checks, not a merchant or platform integration test.
- Hosted password policy was raised from 6 to 12 through the authorized Dashboard. Reopened settings showed 12; two actual Auth HTTP checks rejected 5- and 11-character passwords with `422 weak_password` and a minimum of 12. No test account was created or email-delivery test requested.
- Mobile/desktop browser regression passed: persisted draft editing, approval reset, calendar validation, disabled publication/payments, PKCE signup/reset requests, resend, recovery/global logout, 5-minute previews, and native MediaRecorder using a simulated microphone with mocked Storage.
- TypeScript production build, lint and all six Edge entrypoint type checks passed. Dependency audit was patched to `source-map-js` 1.2.2 and returned zero known vulnerabilities.
- PGlite uses one connection; the separate native PostgreSQL suite verifies SQL concurrency with modeled Auth/Storage catalogs. Hosted worker execution, actual Storage byte handling, real user email delivery, real microphone behavior, actual Gemini video/audio, official social posting/analytics and provider test-mode payments remain unverified.

The latest deployment state is in `supabase/deployments/current-state-2026-10-08.json`; live HTTP evidence is in `tests/live-ai-v3-security-2026-10-08.json`, `tests/live-ai-security-2026-10-08.json`, `tests/live-services-safety-2026-10-08.json` and `tests/live-password-policy-2026-10-08.json`. `tests/live-verification-2026-10-08.json` records the earlier database-update stage. Earlier snapshots are `tests/verification-2026-10-06.json` (live HTTP), `tests/verification-2026-10-08.json` (local preparation) and `tests/payment-readiness-2026-10-08.json` (payment preparation before database approval). See `SECURITY.md` for the remaining launch checks and operator handling.

## Live state and next activation step

Applied on 6 October: `20261006090620_content_system_private_media_and_quota`. The database and private bucket are live; `generate-content` has gateway JWT verification plus `auth.getUser`, uses the existing server Gemini key, and passed real Hindi/text and image generation. Only two provider calls were made in those live tests. The synthetic users/posts/quota were cleaned up. The 69-byte test PNG was deleted after specific owner approval; only a zero-byte folder placeholder remains. No Storage DELETE policy was introduced.

Applied on 8 October after explicit owner approval: `secure_connections_and_publish_queue` (live version `20261008072754`) and the missing payment-event FK index (live version `20261008073442`). Both baseline and payment/session SQL rollback suites passed against the actual database. The tests simulated request claims using database roles; they do not prove an HTTP login/global-signout or live provider flow. All synthetic users, sessions, post/media metadata, orders, events, refunds, credits and temporary gate changes were rolled back. Verified 1 original user, 1 original post, zero payment/queue data and both launch controls false.

Also applied on 8 October: `publication_claim_lock_order` (live version `20261008170743`). A native concurrency test reproduced a worker waiting on an editing post with `55P03`. The fix locks the post before its job, skips busy posts, and reconciles expired/orphaned jobs without waiting on another worker. All 17 native checks passed, followed by exact live function-body readback and three live role/closed-gate checks. The private function retains an empty search path and service-only execution. Both launch gates stayed false; the disabled retained fixture has no sessions. See `tests/live-publication-claim-fix-2026-10-08.json`. The first test run is retained in `tests/native-postgres-concurrency-before-2026-10-08.json`; its media-quota assertion expected an exception instead of the actual RLS denial code, and the corrected check verifies exactly 20 accepted inserts and four `42501` denials.

See `supabase/PAYMENT_SETUP.md` for merchant Test Mode setup. Razorpay account status is unknown; no merchant credentials, production prices or provider test transaction have been configured. The earlier automatic approval blocks were resolved for this database update by explicit owner permission. Website/social publication and real payment collection remain disabled.

The initial posts schema predates migration tracking, and the applied content migration has a different timestamp from the prepared repository file. Recorded live versions differ from the locally generated filenames; see `supabase/migration-history.json`. Reconcile/pull the existing history before any CLI `db push`; do not blindly replay old files.

The schema and five needed server functions are deployed with the JWT/custom authentication settings in `supabase/config.toml`. Live session/global-logout, closed-gate service and password-length checks passed. Dashboard access was completed through the owner-selected ChatGPT sign-in, and the authorized free password policy is applied. Next, continue isolated tests with the disposable account retained disabled, configure isolated platform/merchant tests and the final HTTPS application settings. Payment collection and the publication worker remain subject to their separate activation permissions. No Cron schedule is created by these files.

The latest security advisor still reports disabled leaked-password protection and six informational default-deny private tables. The missing FK index was fixed; earlier performance review found seven informational unused-index notices for new/inactive features. See `SECURITY.md` for reasons and remediation links. The server password minimum is now 12 characters, matching `supabase/config.toml` and the frontend minimum. The hosted value and rejection below that minimum were verified on 8 October. Leaked-password screening remains disabled and requires a separately approved Pro-or-higher plan. See `tests/password-settings-review-2026-10-08.json`. Verified SMTP/CAPTCHA, final redirect/origin allowlists, DB patch review, safe media retention, official platform app approval and merchant test configuration remain launch requirements. No billing plan, payment method, existing personal password or DB engine upgrade has been changed.

Limits in the applied migration: 20 free AI attempts/user/UTC day, up to 100 total using paid credits only after billing approval; failed attempts count. Media <=10 MB/file, 20 objects/user and 80/bucket; drafts <=200/user and 1,000 total. These are conservative abuse limits, not provider spending guarantees. Replaced/detached files remain private until authorized cleanup.
