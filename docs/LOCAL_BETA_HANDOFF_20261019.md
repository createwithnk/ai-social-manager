# Beta development handoff — 19 October 2026

## Delivery and preservation

The user authorized a development push. [fix/beta-readiness-20261019](https://github.com/createwithnk/ai-social-manager/tree/fix/beta-readiness-20261019) now contains the reviewed work; source commit `6deb6f02128913e02ace82c39bd8437b376778ab` passed [CI 39260804248](https://github.com/createwithnk/ai-social-manager/actions/runs/39260804248). Documentation commits may follow that tested source. PR #2 remains draft on its previous branch, main is unchanged, and there was no deployment.

Base development candidate: `beabded`. Local checkpoints `35b047a`, `4b70d7f` and subsequent local commits remain preserved. Connector commits have different metadata/SHAs, but complete source-tree equality was verified before every remote update. The unavailable laptop-only `21e8dce` was not overwritten or claimed synchronized.

## Completed and verified

Existing save/edit-consent changes were preserved. Explicit review is required before either save action; draft save consumes consent. View/Back do not mutate approved content; Edit requires fresh confirmation before converting approved/scheduled content into a draft and clearing its schedule. Revision-conflict content is retained. Rescheduling uses the displayed time and Calendar actions stay disabled while a write is pending.

The existing Supabase SDK is pinned exactly. The unapproved source manifest covers persistence/workflow/dependencies, the pinned CI workflow and native tooling. The three reviewed SQL payloads remain unchanged. Native child processes receive a minimal environment with explicit local socket/user/database and no inherited connection-service or credential configuration.

Verified GitHub CI results:

- 96 Node tests, 81 isolated PGlite SQL checks and 26 desktop/mobile browser cases.
- Pinned Deno 2.9.6 type check and 24 endpoint/security tests with 15 payment substeps; no test network permission.
- Lint; app, Edge and browser TypeScript; production build; read-only review manifest.
- 11 native PostgreSQL 17.6 checks, including eight independently overlapping budget requests and synthetic logical backup/restore. The disposable cluster stopped.
- Dependency installation reported zero known vulnerabilities.

See [test report](TEST_REPORT.md) and [exact CI evidence](evidence/beta-ci-20261019.json). Browser/provider behavior is mocked; no provider request or hosted mutation is implied.

## Native test and recovery scope

CI pins the official PostgreSQL 17.6 container by digest, matching the hosted engine version observed on 19 October. `npm run test:native-beta` creates its own socket-only temporary cluster, loads synthetic Auth/Storage catalogs and verifies exact historical/pending SQL hashes. It exercises invite/approval/budget/rollback protections, exports a password-free role file and custom logical archive, then restores into a fresh database in the same disposable cluster.

The result certifies this synthetic rehearsal only. It does not verify separate-cluster role restoration, an actual recoverable hosted backup, real Auth/Storage service state or stored-object bytes. Hosted backup/recovery evidence remains a launch blocker.

The local workspace maps only UID 0, so it cannot provision an unprivileged PostgreSQL cluster. Its earlier startup failure remains a local environment limitation. GitHub CI supplies native acceptance without disabling PostgreSQL root protection, changing user mappings or falling back to hosted resources.

## Re-run safely

Use Node 24 and `npm ci`, followed by `npm test`, `npm run lint`, `npm run check:edge`, `npm run check:e2e`, `npm run build`, `npm run review:beta`, `npm run check:deno`, `npm run test:edge` and `npm run test:e2e`. Deno remains pinned to 2.9.6. The optional `AASIFLOW_TEST_DENO_BIN` must be absolute and that exact version; `AASIFLOW_TEST_BROWSER` can select an installed Chromium binary without changing production configuration.

Native acceptance requires an absolute `AASIFLOW_TEST_PG_BIN` pointing to PostgreSQL 17 server and dump/restore tools on Linux/macOS/WSL, with permission to create an unprivileged disposable cluster. No hosted URL input exists. The runner stops only its own cluster and writes ignored synthetic evidence under `test-results/native-beta.json`.

## Remaining release order

1. Obtain an authorized recoverable hosted backup and isolated recovery evidence, including real service/object dependencies. Review canonical migration mappings and existing-user impact.
2. Review the exact current manifest before any separately approved hosted SQL, Auth/identity privileges, runtime deployment or test fixtures. Do not use blanket `db push`. The unchanged hosted database lacks required Beta RPCs.
3. Establish provider no-charge boundaries before any real AI request. Complete human Arabic/screen-reader review and cohort/privacy/support decisions before invitations.

Earlier read-only hosted checks confirmed healthy PostgreSQL 17.6, unchanged four migration versions, RLS enabled and publishing/billing false. The three proposed additions are not applied. No live SQL writes, memberships, customer-data cleanup, provider requests, charges, invitations or deployment were performed.

Continue reversible code/test work autonomously within the user's instructions. Pushing development code is authorized; public release and paid activity remain outside that authorization.
