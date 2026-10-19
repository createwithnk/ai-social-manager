# Local Beta handoff — 19 October 2026

## Scope and preservation

Base: remote development candidate `beabded`, draft PR #2. This isolated working copy does not replace the unavailable laptop-only `21e8dce`. Preserve both until an exact-tree/diff comparison is possible. No push, merge, hosted change, deployment, paid call, posting, payment activation, invitation or customer-data cleanup is authorized by this handoff.

Local implementation checkpoint: `35b047a` on `fix/beta-readiness-20261019`. A fresh local clone installs from the committed lockfile without lifecycle scripts, builds, passes 94 Node/81 PGlite checks and verifies the source manifest with a clean worktree. No GitHub CI or remote synchronization is implied; this branch was not pushed.

Existing save/edit-consent changes were preserved and verified. New work fixes displayed-time rescheduling and lint, prevents concurrent Calendar actions while a write is pending, extends draft/detail/Arabic/mobile regression coverage, pins the existing Supabase SDK version, adds local runtime preflights and broadens the unapproved source manifest. The three reviewed SQL payload hashes remain unchanged.

## Verified checks

- 94 Node tests and 81 isolated PGlite SQL checks.
- 26 desktop/mobile browser cases; localhost-only requests, mocked backend/provider behavior.
- Deno 2.9.6 type check and 24 tests with 15 payment substeps; no test network permission.
- Lint; app, Edge and browser TypeScript; build; `review:beta`; whitespace check.
- Read-only hosted identity/history/catalog: healthy project, four historical migrations unchanged, RLS enabled, new Beta RPCs/owner tables/scheduling guard absent, publishing and billing false.

`npm audit --omit=dev --json` reports zero known production dependency vulnerabilities on 19 October 2026. This is not a security certification or a guarantee that unknown vulnerabilities do not exist.

## Re-run locally

Use Node 24 and `npm ci`, then `npm test`, `npm run lint`, `npm run check:edge`, `npm run check:e2e`, `npm run build` and `npm run review:beta`. The default Edge scripts retain the pinned npm Deno 2.9.6 launcher. If an already verified local binary is required, `AASIFLOW_TEST_DENO_BIN` must name its absolute path; another version is rejected. `AASIFLOW_TEST_BROWSER` optionally selects an already installed Chromium test binary without changing production configuration.

`npm run test:native-beta` requires `AASIFLOW_TEST_PG_BIN` set to an absolute PostgreSQL 17 bin directory on Linux/macOS/WSL. It creates a fresh synthetic cluster in a new temporary directory, disables all TCP listeners, uses fixed synthetic identities and ignores hosted database URLs. It applies the exact reviewed SQL locally, tests invite/approval/rollback behavior and requires eight independent connections to contend on the budget lock. It stops its own cluster and preserves synthetic evidence. It never resets, migrates or connects to an existing database. The `pg` driver is development-only and pinned in the lockfile.

The present container maps only UID 0, so creating the required unprivileged cluster fails before PostgreSQL starts. Native validation is **not complete**. Do not disable PostgreSQL's root-user protection, change user mappings, point the runner at hosted resources or mark mock/PGlite results as native acceptance. The runner's native-success path still needs a real run. Actual hosted logical backup, pg_dump/pg_restore and recovery evidence remain separate work.

## Remaining release order

1. Obtain/verify a recoverable authorized backup and run native restore, catalog and concurrent-session acceptance in an isolated environment. Keep historical migration timestamp mappings intact.
2. Review exact current hashes and existing-user impact before any explicitly approved hosted SQL, Auth, UUID membership/owner assignment, runtime deployment or test fixtures. Do not use blanket `db push`. The unchanged hosted database does not yet have the RPCs required by this frontend.
3. Establish provider-account no-charge boundaries before any real AI request; keep AI/uploads, publishing and billing paused. Complete human Arabic/accessibility review and owner-approved cohort/privacy/support decisions before invitations.

The user has asked for safe autonomous local work, not for new public deployment or paid activity. Continue safe code/tests without repeatedly requesting permission; leave the separately gated live actions pending rather than expanding authority.
