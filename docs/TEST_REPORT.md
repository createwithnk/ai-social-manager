# Compatibility test report

## Local verification — 19 October 2026

94 Node tests and 81 PGlite database checks pass; 26 desktop/mobile Playwright cases pass with a complete Chromium 153 test binary. The new browser cases cover single-use draft review, read-only View/Back, fresh conversion confirmation and unchanged rescheduling times. Pinned Deno 2.9.6 check and all 24 security/endpoint tests (15 payment steps) pass with no network permission for tests. Lint, app/Edge/browser TypeScript, production build, source-manifest verification and whitespace checks pass.

A fresh local Git clone of checkpoint `35b047a`, with no local environment file or existing node_modules, also passes `npm ci --ignore-scripts --no-audit --no-fund`, production build, all 94 Node/81 PGlite checks and `review:beta`; its worktree stays clean. This verifies the committed source/lockfile, not a remote push or release. Production-only npm audit reports zero known vulnerabilities.

The initial browser binary was truncated and the standard browser download failed; neither was counted as a passing run. A complete existing Brotli-packaged Chromium binary was extracted to a new temporary path without replacing existing assets, then all 26 cases passed. The default npm Deno launcher hit `ECOMPROMISED: Lock compromised`; the added absolute-path override verifies exactly Deno 2.9.6 before execution. This does not suppress npm integrity checks or relax test network permissions. New tests reject missing/relative native tool paths and invalid Deno versions.

Native PostgreSQL remains **blocked before cluster creation**, not passed. PostgreSQL 17.10 binaries were prepared outside the repository with install scripts disabled and reviewed symlink hydration, but the container only maps UID 0 and `chown` to an unprivileged identity fails with EINVAL. The new `test:native-beta` runner records this blocker, never substitutes a hosted database and has no production URL input. Its native SQL/concurrency path still needs execution in a suitable isolated environment. No native pg_dump/pg_restore or hosted backup recovery is certified.

Read-only hosted checks confirm the unchanged four historical migrations, missing proposed Beta/owner/scheduling additions, RLS enabled and publishing/billing false. These catalog checks do not certify email delivery, hosted isolation, provider free-tier settings or applied runtime behavior. No live SQL writes, deployed code, provider request, charge, invitation, push or main merge occurred.

## Current Beta-safety candidate — 13 October 2026

Final local continuation: 87 Node tests passed, including additional raw-Auth-error redaction, session-bootstrap redaction and bounded AI transport/limit-message checks; 81 canonical PostgreSQL checks remain passed, with the separate Beta proposal/rollback fixture covered by the Node suite. All 20 desktop/mobile cases passed, including Arabic access-service retry in addition to denial/revocation and recovery. Build, lint, app/Edge/browser TypeScript, Deno check, 24 Deno tests (15 payment steps) and read-only manifest verification pass. No hosted/provider calls or secret inspection occur in these fixtures.

Synchronized checkpoint 3f1ca14 passed push CI 38333292992 and PR CI 38333296235. The continuation must pass its own branch CI. Local backup preservation/tree equality were verified before synchronization; no destructive Git operation was used.

84 Node tests passed, including isolated PostgreSQL Beta migration/rollback acceptance; 81 additional canonical local PostgreSQL checks passed. 18 desktop/mobile browser cases passed. Production build, lint, app/Edge/browser TypeScript and pinned Deno check passed; 24 Deno security tests and 15 payment steps passed. Final checks will be verified on the pushed candidate independently of the earlier checkpoint CI.

New acceptance covers exact caller/server RPC credentials, no provider call after reservation denial/failure or missing monitoring setup, thinking-inclusive token measurement, unknown/failed telemetry preserving reservations, budget carryover across UTC days, project/per-user limits, no client completion forgery, invite expiry/revocation, coded counter allowlists/caps, disabled direct uploads, Arabic owner/recovery layouts, keyboard/touch controls and operational rollback preserving data/access guards. The deployment manifest records reviewed payload hashes. No keys, raw errors or prompts are sent to monitoring.

All API/provider requests in tests are synthetic/intercepted. Browser requests outside localhost are blocked. Local PGlite queues do not certify native concurrent PostgreSQL or hosted gateway/Auth/Storage behavior. Hosted configuration, live email/invitations, native-speaker/screen-reader acceptance, provider no-charge proof and real usage measurements remain pending separate approval. The new upload path is disabled; retained legacy validation is regression-tested with an explicit enabled fixture, not enabled at runtime.

Remote c246e2f is verified with successful push run 38330765999 and PR run 38330770147. Earlier reports below are checkpoint history. See PRIVATE_BETA_RELEASE_REVIEW.md for the test/release sequence.

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

## 13 October owner monitoring checks

63 Node tests, 81 isolated PostgreSQL checks and 24 Deno security tests (15 payment steps) passed. Edge/Deno and browser TypeScript checks passed. Existing eight desktop/mobile browser cases passed; final suite includes two added owner access-denial cases. Local admin checks cover ordinary users, self-grants, removed membership, revoked sessions, anonymous access, exact aggregate output and safe malformed/error UI. New successful owner rendering is tested with a component fixture; hosted owner acceptance remains pending. No provider calls or live data changes.

Final verification: all 10 desktop/mobile browser cases passed, including dashboard denial/refresh/viewport checks. Final production build, lint, app/Edge/browser TypeScript, Deno checks and whitespace verification passed. Sandbox process-spawn failures were rerun with approved local execution. No hosted acceptance is implied.
