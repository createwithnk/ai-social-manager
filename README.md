# AasiFlowAI

A review-first social content workspace. **Website/social publication and payment activation remain blocked pending owner permission.**

| Area | Status on 8 October 2026 |
| --- | --- |
| Supabase email login, drafts, private media and text/image Gemini backend | Existing live setup; 22 HTTP checks passed on 6 October |
| Password confirmation/recovery, PKCE and global logout UI | Implemented; browser tested with mocked Auth |
| Active-session RLS, storage/draft quotas and post revisions | Prepared and locally tested; live migration not applied |
| Instagram/LinkedIn connections, encrypted tokens and approval-bound publishing queue | Implemented and mock tested; official app settings and live activation pending |
| Real metrics and observed posting-time suggestions | Implemented; no fabricated data; live platform checks pending |
| Hosted payment links, verified events, credit accounting and refund reconciliation | Prepared and tested locally; no merchant credentials, payment mode or collecting enabled |
| Production security headers | Generated; hosting/domain configuration and deployment still pending |

The live `generate-content` function is still the previously verified version. The new version requires the prepared session-security migration and has **not** been deployed. The new social/payment functions have **not** been deployed or scheduled. The live project still has its original 1 Auth user and 1 post; payment/queue tables do not exist there.

## Workspace

- Responsive dashboard, drafts, editable content, explicit approval and a planning calendar.
- English/Hindi/Urdu/Arabic AI briefs; clearly labelled English local templates.
- Private image/video/audio uploads, signed previews and browser recording with a 60-second cap. File signatures/MIME/size/owner paths are checked; recorder multipart MIME is normalized.
- Saved post revisions prevent lost updates after the new migration. Editing approved/scheduled content clears approval and its plan.
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

- `tests/database.mjs`: 70 local PostgreSQL checks, including the baseline rollback suite, cross-user/anonymous denial, signed-out session rejection, immutable ownership/revisions, approval changes, dual-gate DB checks, job leases, OAuth replay/expiry, read-only metadata, payment replay/amount verification, credit debits/refunds and storage/draft quotas.
- `tests/security.test.ts`: 23 Deno tests covering encryption/tampering, request limits, redirect/host validation, OAuth scopes/identity, provider publish/upload flows, uncertain outcomes, null analytics, hosted checkout, raw-byte HMAC, merchant/captured-payment/refund validation, and fail-closed launch gates.
- `tests/payment-endpoints.test.ts`: actual checkout/webhook handlers with intercepted Auth/database/provider HTTP; 14 request-flow checks cover closed gates, revoked sessions, client price/credit/owner tampering, forged events, verified refund routing and uncertain provider responses.
- 10 client/workflow unit tests plus the mocked generation endpoint suite passed.
- Mobile/desktop browser regression passed: persisted draft editing, approval reset, calendar validation, disabled publication/payments, PKCE signup/reset requests, resend, recovery/global logout, 5-minute previews, and native MediaRecorder using a simulated microphone with mocked Storage.
- TypeScript production build, lint and all six Edge entrypoint type checks passed. Dependency audit was patched to `source-map-js` 1.2.2 and returned zero known vulnerabilities.
- Local PostgreSQL uses PGlite's single connection and modeled Auth/Storage catalogs. These checks do not prove live Auth/Storage behavior or multiworker concurrency. Real user email delivery, real microphone behavior, actual Gemini video/audio, official social posting/analytics and provider test-mode payments remain unverified.

See `tests/verification-2026-10-06.json` for the earlier live HTTP result and `tests/verification-2026-10-08.json` for the current scope. See `SECURITY.md` for the actual remaining launch checks and operator handling.

## Live state and next activation step

Applied on 6 October: `20261006090620_content_system_private_media_and_quota`. The database and private bucket are live; `generate-content` has gateway JWT verification plus `auth.getUser`, uses the existing server Gemini key, and passed real Hindi/text and image generation. Only two provider calls were made in those live tests. The synthetic users/posts/quota were cleaned up. The 69-byte test PNG was deleted after specific owner approval; only a zero-byte folder placeholder remains. No Storage DELETE policy was introduced.

Prepared next migration: `supabase/migrations/20261007071717_secure_connections_and_publish_queue.sql`. The owner authorized starting payment work on 8 October. **Automatic approval review still rejected this combined update because payment-work approval did not explicitly cover its broader Auth/RLS, trigger, OAuth and publication-schema changes. No part has been applied.** Obtain explicit permission for the whole reviewed update before running it. Both DB launch controls and both environment gates default to false even after application.

See `supabase/PAYMENT_SETUP.md` and `tests/payment-readiness-2026-10-08.json` for the merchant test-mode handoff and latest blocked status. Razorpay account status is unknown; no merchant credentials, production prices or provider test transaction have been configured.

The initial posts schema predates migration tracking, and the applied content migration has a different timestamp from the prepared repository file. Reconcile/pull the existing history before any CLI `db push`; do not blindly replay old files.

After authorized application, deploy only the needed server functions with the JWT/custom authentication settings in `supabase/config.toml`, and perform live isolation/session tests. Payment collectors and the publication worker remain subject to their separate activation permissions. No Cron schedule is created by these files.

The live security advisor still reports disabled leaked-password protection; performance advisors have no findings. Server password policy, verified SMTP/CAPTCHA, final redirect/origin allowlists, DB patch review, safe media retention, official platform app approval and merchant test configuration remain launch requirements. No billing plan, payment method or DB engine upgrade has been changed.

Limits in the prepared migration: 20 free AI attempts/user/UTC day, up to 100 total using paid credits only after billing approval; failed attempts count. Media <=10 MB/file, 20 objects/user and 80/bucket; drafts <=200/user and 1,000 total. These are conservative abuse limits, not provider spending guarantees. Replaced/detached files remain private until authorized cleanup.
