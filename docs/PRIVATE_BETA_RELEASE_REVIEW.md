# Private Beta release review — 19 October 2026

## Current development evidence

Development push is authorized and completed on [fix/beta-readiness-20261019](https://github.com/createwithnk/ai-social-manager/tree/fix/beta-readiness-20261019). Tested source `6deb6f02128913e02ace82c39bd8437b376778ab` passed both jobs in [CI 39260804248](https://github.com/createwithnk/ai-social-manager/actions/runs/39260804248). The current manifest names this development branch, remains unapproved, and retains the same three SQL payload hashes. PR #2 is still draft on its prior branch; no main merge or deployment occurred.

Eleven native PostgreSQL 17.6 checks now verify synthetic SQL/rollback, retained data/revisions/media metadata, invite isolation, eight independently overlapping budget reservations and logical backup/restore. [Recorded evidence](evidence/beta-ci-20261019.json) includes source hashes and confirms the disposable cluster stopped. Restore uses a fresh database in the same cluster with reused roles; actual hosted recovery, independent-cluster role restoration, Auth/Storage service state and object bytes remain unverified.

This closes the synthetic native-test gap only. Stage 1 below still requires authorized hosted/sanitized backup evidence; all subsequent hosted SQL, identities, runtime, provider and invitation stages remain unapproved. Continue safe local work without treating development push permission as permission for those actions.

## Earlier checkpoint history — 13 October 2026

Status: local release candidate, not approved for hosted changes. Project `nkfecpdegcmsapvbviky`, development branch `chore/security-and-approval-hardening`. Checkpoint `c246e2fc70dc5b6737b178bb184d7145055612e8` is verified on GitHub; [push CI 38330765999](https://github.com/createwithnk/ai-social-manager/actions/runs/38330765999) and [PR CI 38330770147](https://github.com/createwithnk/ai-social-manager/actions/runs/38330770147) both succeeded. Later work must pass its own CI after push.

The subsequent checkpoint 3f1ca14 is pushed and locally synchronized, with [push CI 38333292992](https://github.com/createwithnk/ai-social-manager/actions/runs/38333292992) and [PR CI 38333296235](https://github.com/createwithnk/ai-social-manager/actions/runs/38333296235) successful. Final local continuation redacts raw authentication/AI exceptions, distinguishes unavailable access checks from declined invitations, shows translated retry guidance and bounds browser generation requests to 60 seconds without retry. Limit responses do not promise automatic midnight recovery. None of these changes approve hosted actions.

## Prepared behavior

Invited UAE businesses can generate English/Arabic text drafts, edit, save and explicitly approve them. New briefs default to UAE; existing briefs keep their previous preference. Market remains prompt-only. Revision checks and prior-approval protections remain intact. Social publishing, payments, billing and public invitations remain closed/outside this release.

Public signup is removed from the app and its Auth helper. A captured invitation-flow flag shows password setup before continuing. The workspace requires a positive server `beta_access()` response, rechecks on focus/every minute, and discards access on expiry/revocation. Missing setup/network failure denies access. A separate read-only owner dashboard still requires private owner membership and an active session.

The proposal adds restrictive invite policies on content, usage, existing social/payment metadata and Storage. Existing ownership/session/lifecycle policies are retained and intersected. Membership uses operator-managed Auth UUIDs with expiry/revocation; editable user metadata, email matching and frontend toggles cannot grant it. Auth signup must ALSO be disabled at the hosted service to prevent direct account creation; existing users without membership cannot access the protected data. [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration) distinguishes signup/anonymous controls from database authorization.

## Monitoring and usage limits

The generator runtime uses a caller-authorized `reserve_ai_request` RPC. A configuration-row lock serializes project reservations, checks the existing per-user quota with a configurable limit of at most 20/day, then reserves a project request and cost allowance atomically. There is no duplicate daily quota table. The old public quota wrapper returns false in the proposed Beta mode: an old generator cannot bypass the reviewed token/output limits or trust boundary. The private per-user accounting remains unchanged and is called only inside the new reservation path. The new runtime must be accepted before separately approving AI activation.

The shipped SQL defaults to AI disabled, uploads disabled, zero daily requests/budget and unconfigured rates. AI cannot activate with invalid/incomplete rates or an insufficient per-request reserve. Output is bounded to 128–2048 tokens (default 1024), the reviewed model is `gemini-2.5-flash`, thinking is disabled and AI attachments are disabled. Text requests/bodies are bounded. The conservative reserve uses a 16,384-input-token allowance plus the output limit at owner-reviewed rates. This allowance is an engineering bound requiring provider acceptance, not provider billing certification.

Only the trusted Edge runtime completes a reservation, through a fixed service-only RPC. The existing server service-role credential is used for this numeric completion write; it never enters Vite or supplies customer-content reads. Missing credentials/configuration prevents provider calls. Completion records only enum outcome, numeric token counts (including thinking), latency and reservation-snapshot rates. No prompts, captions, emails, keys, URLs, filenames, exceptions or stacks are stored/logged. Idempotent completion prevents replay from changing usage.

Returned tokens are measurements; USD amounts are estimates at configured prices, not invoices. Cached/tool/inconsistent/missing usage is treated as unknown. Full reservations are retained after success, errors or timeouts; unresolved prior-day usage carries into subsequent daily budgets. A measured estimate above its reservation closes the AI gate. Failed completion leaves the reservation pending. No automatic refund, retry, reservation expiry, quota increase or paid activation occurs. Provider prices/free-tier availability and other workloads can differ: only the provider's own verified account/billing boundaries can establish no-charge operation. The database cannot guarantee a provider invoice cap.

Browser reporting accepts only six fixed error codes, suppresses duplicates, limits in-session sends and caps server ingestion to 20 reports per invited user/UTC day. These are untrusted client counters, shown separately from trusted generator outcomes. A translated recovery boundary covers rendering failures; caught errors do not print raw details. Authentication/gateway/host errors before reservations are not fully instrumented; hosted audit acceptance remains required.

Counters and reservations are private with no client/service table reads. The service completion RPC's private implementation remains fixed and narrowly granted, while the server credential itself is privileged and must stay server-only. Owner output is aggregate-only. No analytics vendor or paid monitoring service is added. Review aggregate counts daily through the owner dashboard; no automatic alert delivery is configured.

## Media and accessibility

New uploads/microphone recording are blocked in the UI and upload helper. The proposed restrictive Storage insert policy also defaults to blocking direct uploads. Existing objects and metadata are retained; approved members can still obtain five-minute private previews. Previously issued URLs remain valid until expiry. Container signatures are not a malware scanner. Re-enabling uploads requires a separately reviewed safety/maintenance plan and both a new frontend release and approved database gate change; it does not enable multimodal AI generation.

Owner metrics, invite denial, paused uploads and recovery screens have Arabic translations/RTL support. Controls use at least 44-pixel height/width; inputs avoid mobile zoom and metrics wrap on small screens. Desktop/mobile browser fixtures exercise keyboard activation, Arabic layouts, access revocation, recovery and no upload/microphone controls. Native-speaker, screen-reader and hosted email acceptance are still needed.

## Exact SQL scope and reversible operation

`deployment/beta-review.json` contains LF-normalized SHA-256 hashes generated by `node scripts/release-review.mjs`. The script reads only fixed public/source paths, performs no network calls and deploys/applies nothing. Recompute and compare the hashes before approval/execution.

`npm run review:beta` (or `node scripts/release-review.mjs --check`) verifies the existing manifest without modifying files. It covers critical frontend access/monitoring/media code, generator code, proposed SQL/rollback and browser header policies. A mismatch fails the review gate and CI; regenerate only after reviewing the change. The complete pushed commit remains the deployment approval target. The manifest does not prove backup readiness, hosted configuration, no-charge provider access or grant launch permission.

After backup/restore and canonical-history review, request permission for exactly these payloads, in order:

1. `supabase/migrations/20261013000000_require_prior_approval.sql`: additive scheduling guard.
2. `supabase/migrations/20261014000000_owner_monitoring.sql`: private owner membership and aggregate RPC; no membership assignment.
3. `supabase/proposals/20261015000000_private_beta_safety.sql`: transaction-wrapped private memberships/controls/reservations/counters, restrictive policies and gated RPCs. It checks its prerequisites, keeps AI/media disabled and creates no members/admins.

The proposal stays outside the active migration directory to prevent accidental blanket application. Do not replay historical migrations, repair history, apply archived proposals, recreate buckets or reset the database. Validate the exact hosted catalog and migration mappings again before permission; local PGlite fixtures do not prove the hosted catalog or native concurrent behavior.

Applying the restrictive policies immediately denies workspace data to every current account without an active Beta membership, including an owner who is not enrolled. Review the existing-user impact and maintenance window before database approval. Membership and admin assignment remain separate actions; the migration inserts neither.

`20261015000000_private_beta_safety.rollback.sql` is a tested operational rollback: pause AI/uploads and revoke the new reservation/telemetry execute privileges while retaining all invite policies, schema and data. It is intentionally not a destructive schema reversal. The legacy quota path also fails closed afterward. Separately approved reinstatement restores the six exact execute grants in that file and reviewed configuration. Do not drop counters/memberships or relax access to recover the UI. Keep the paused dashboard/access-screen release available during rollback. The scheduling trigger has its separate narrow rollback in BACKEND_COMPATIBILITY.md; do not alter the existing lifecycle trigger.

## Staged/hosted acceptance plan — separate permission for each stage

| Stage | Scope and acceptance | Permission boundary |
| --- | --- | --- |
| 1: isolated restore | Use an owner-provided sanitized schema/backup in an isolated PostgreSQL environment; compare canonical function/policy/history contracts; execute the three exact payloads and operational rollback; retain posts/media/revisions; test native two-session reservation contention | Access to backup/staging resources if needed; no production writes |
| 2: reviewed database change | Confirm project, current catalog, recoverable backup and exact hashes; apply only the reviewed SQL; verify zero memberships, paused AI/uploads, zero limits, closed social/billing gates | Explicit permission to apply the named SQL to the named project |
| 3: Auth and identities | Choose exact HTTPS URL/redirects; disable public/anonymous signup; approve existing test UUID memberships/expiries and separate owner UUID privileges; test invite/password setup and recovery with authorized addresses | Separate configuration, identity/privilege and test-email approval; no real-user invitations |
| 4: paused runtime | Approve exact pushed commit, frontend host/origin/CSP/redirect configuration and generator version; leave AI/media off; test owner/ordinary/expired/revoked sessions and direct REST denials | Separate limited deployment approval; no main merge |
| 5: integration | With authorized test UUIDs, verify RLS isolation, approved/draft edits, revision conflicts, scheduling rejection, signed URL expiry, direct upload rejection, sanitized reports and hosted headers/gateway failures. This writes test fixtures/counters | Separate hosted test-data permission; no cleanup/deletion without scope approval |
| 6: provider acceptance | Verify provider model/rates/account free-tier and project-wide quotas/spend boundaries first; approve exact request/cost/per-user limits and finite number of English/Arabic test requests; verify numeric usage, unknown-cost behavior and shutdown | Separate provider-use permission that establishes no charges; if no-charge operation cannot be verified, keep AI paused |
| 7: private cohort | Native Arabic and critical screen-reader/mobile review; support/privacy/retention plan; approve named small cohort and invitation emails | Explicit invitation/Beta-release approval |

Review retention at 30 days as a proposed policy, not a running job. No automatic expiry cleanup or deletion is scheduled. Do not delete unresolved reservations: first reconcile provider records under separate permission. Each stopped stage leaves subsequent actions paused while safe local work continues.

**Next live approval needed:** approve applying the three exact SQL payloads above to `nkfecpdegcmsapvbviky`, after confirming recoverable backup/restore evidence, canonical mappings and existing-user impact. This is needed because server invite enforcement, project budget reservations and monitoring require those schema changes. Approval must name the source hashes from `deployment/beta-review.json`; AI/uploads remain off and no privileges/memberships are assigned. If backup/staging evidence is missing, provide or separately authorize that controlled hosted review first. Admin assignment, Auth settings, deployment, test data, provider calls and real invitations remain separate approvals.
