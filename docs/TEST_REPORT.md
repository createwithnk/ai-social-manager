# Compatibility test report

Date: 12 October 2026. Confirmed backend: nkfecpdegcmsapvbviky. This reconciliation used local fixtures only; no live mutation, provider usage, social publication or payment activation.

| Check | Latest outcome |
| --- | --- |
| Node/workflow regression suite | 60 passed |
| Existing backend local PostgreSQL suite | 71 checks passed |
| Canonical migration hashes | All four payloads match the existing history manifest after checkout newline normalization |
| Legacy-data migration test | Existing post content, ownership, status and creation timestamp survive; no duplicate quota/reservation tables or bucket |
| New scheduling guard | Local direct scheduled inserts and draft-to-scheduled updates rejected; approved transitions and existing revision trigger retained |
| Actual Deno check | Passed for generator, social-account/callback, publish-worker and payment-checkout/webhook with pinned Deno 2.9.6 |
| Deno security/endpoint tests | 24 passed, including 15 payment-handler steps; fetch intercepted, no network permission |
| Desktop/mobile preview | 8 passed: CSP enforcement plus approval edit/revert, scheduling/edit reset, Arabic persistence/RTL, mobile keyboard/viewport checks |
| Frontend production build | Passed |
| Lint | Passed with no errors/warnings; browser artifacts ignored to prevent scan/removal races |
| Strict SDK/Edge TypeScript | Passed; actual Deno check is now available as an additional gate |
| Earlier pushed checkpoint | 4f4790a verified on remote; CI run 38288727459 passed. Later Beta preparation CI must be checked after push |

The previous duplicate-backend tests are superseded by canonical-contract and existing-backend tests, not counted as live validation. The Node suite covers verified authentication, revoked sessions, CORS, streamed request/provider bounds and deadlines, legacy language/key configuration, attachment owner/download failures, platform limits, safe errors, manual reapproval, returned revisions, missing-revision rejection, private signed previews and unavailable client deletion.

PGlite executes the actual canonical SQL plus the new pending guard in an isolated database with simulated Auth/Storage catalogs. Existing tests cover two-user RLS, revoked sessions, quota isolation/caps, immutable approvals/revisions, queue leases/processing locks, OAuth replay, closed launch controls and idempotent credit/refund accounting. These checks do not certify the hosted gateway, real Storage upload enforcement, network concurrency or an actual payment merchant.

Run npm ci, npm run lint, npm run check:edge, npm run check:deno, npm run check:e2e, npm run build, npm test, npm run test:edge and npm run test:e2e. Node 24 is required; Deno 2.9.6 is downloaded through a pinned npm execution wrapper that supports npm missing from Windows PATH. The test SQL files named live-* are used only as offline fixtures during this run.

Browser tests start a local preview at 127.0.0.1:4179 with placeholder Supabase values and block external page requests. Local language/browser storage is isolated. Real new-function tests, email delivery, native-speaker/full accessibility review, malware scanning, retention and hosted-log auditing remain pending owner-approved release work.

Beta preparation added four header-policy tests and four desktop/mobile CSP browser cases. All 60 Node/workflow tests and 71 local PostgreSQL checks passed; all eight browser tests, build, lint and browser TypeScript passed. Deno/backend code is unchanged since the verified compatibility CI. No live mutations or provider calls were made. The host-header artifacts are prepared, not deployed.
