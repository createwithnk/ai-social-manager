# Compatibility test report

## Verified development CI — 19 October 2026

Code commit `3c617adfb2eeb008b90a363a447797bbc236a240` on `fix/beta-readiness-20261019` passed [run 39267865055](https://github.com/createwithnk/ai-social-manager/actions/runs/39267865055). Both `validate` and `native-beta` jobs succeeded. [Machine-readable evidence](evidence/beta-ci-20261019.json) records the exact source commit, native report and verification limits.

| Check | Verified result |
| --- | --- |
| Node regression/tooling tests | 96 passed, 0 failed |
| Canonical isolated PGlite SQL checks | 81 passed |
| Desktop/mobile Playwright cases | 26 passed |
| Pinned Deno 2.9.6 security/endpoint tests | 24 passed, 15 payment substeps, 0 failed; no test network permission |
| Native PostgreSQL 17.6 acceptance | 11 passed; both socket-only synthetic clusters stopped successfully |
| Lint, app/Edge/browser/Deno types, production build, review manifest | Passed |
| Dependency audit during CI installation | 0 known vulnerabilities reported |

The browser fixtures cover single-use draft review, read-only View/Back, fresh conversion confirmation, revision/approval behavior, unchanged rescheduling, Arabic/mobile layouts, invitation revocation and CSP enforcement. Backend/provider requests are intercepted; these are not hosted integration results.

The native job runs the canonical fixture SQL, then the three exact reviewed payloads and operational rollback. It verifies retained synthetic posts/revisions/media metadata, closed defaults, invitation isolation, direct-upload denial, prior-approval enforcement, eight independent sessions contending on the budget lock, and idempotent service completion/client-forgery denial. pg_dump/pg_dumpall/psql/pg_restore then restore synthetic roles, data, RLS, policies, functions and effective privileges into a separate fresh cluster. Role attributes and memberships match; schema/table/function/default grants match; revoked access, scheduling approval and closed runtime grants remain enforced. A rolled-back PUBLIC execute grant is detected as a mismatch.

The fresh restore cluster has its own bootstrap postgres role. A derived roles script omits only that duplicate CREATE ROLE; every dumped ALTER and membership grant is retained and applied with psql startup files disabled and ON_ERROR_STOP enabled. Raw and derived script hashes are recorded. Passwords are deliberately excluded. Actual hosted backup recovery, real Auth/Storage service state and stored-object bytes remain unverified. No hosted database, provider API, customer data or credentials are used.

The first native CI attempt failed at pg_dump because an inherited-service isolation sentinel was invalid for libpq. The corrected environment helper omits service configuration entirely, permits only necessary system variables and fixes the local socket/user/database. Two regression cases verify inherited credentials, connection services and preload hooks are excluded. Subsequent separate-cluster rehearsal caught a bootstrap-grantor mismatch and explicit-versus-implicit owner ACL representation differences. The final runner restores using the fresh matching bootstrap role and compares effective built-in ACL defaults, preserving owners, grantors, PUBLIC permissions and grant options. The PUBLIC-grant negative control confirms that permission expansion still fails comparison. See the PostgreSQL [dump/restore guidance](https://www.postgresql.org/docs/17/app-pg-dumpall.html) and [ACL functions](https://www.postgresql.org/docs/17/functions-info.html). The successful run above is the acceptance result; failed attempts are not counted as passed.

Earlier local verification passed all 26 browser cases using complete Chromium 153 and pinned Deno 2.9.6. A fresh local clone of `35b047a` installed from the lockfile with lifecycle scripts disabled, built and passed its then-current 94 Node/81 PGlite checks with a clean worktree. The local root-only native startup failure was not bypassed; normal isolated GitHub CI supplied the verified native run.

Read-only hosted checks earlier on 19 October confirmed unchanged historical migrations, missing proposed Beta/owner/scheduling additions, RLS enabled and publishing/billing false. Hosted email, gateway, runtime, isolation and provider free-tier acceptance remain pending. Pushing development code did not apply SQL, deploy, invite anyone, call a provider, activate billing/publishing or merge main.

Earlier checkpoint results below are historical.

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
