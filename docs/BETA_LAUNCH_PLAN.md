# AasiFlowAI Beta launch preparation

## Latest hosted review — 22 October 2026

The [fresh read-only receipt](evidence/hosted-readonly-20261022.json) confirms the live scheduling/Beta/owner additions are still absent and publishing/billing remain closed. A safe backup-inventory tool is prepared; actual backup availability and recovery remain unverified because task-scoped read access is unavailable. Follow [CONTINUE_AASIFLOWAI.md](CONTINUE_AASIFLOWAI.md) and [HOSTED_BACKUP_REVIEW.md](HOSTED_BACKUP_REVIEW.md). Do not repeat the completed synthetic native rehearsal or treat a metadata inventory as recovery proof. No hosted mutation, provider call, paid upgrade or deployment occurred.

## Current development candidate — 19 October 2026

The authorized development branch [fix/beta-readiness-20261019](https://github.com/createwithnk/ai-social-manager/tree/fix/beta-readiness-20261019) is pushed. Source commit `3c617ad` passed [CI 39267865055](https://github.com/createwithnk/ai-social-manager/actions/runs/39267865055): 96 Node tests, 81 PGlite checks, 26 browser cases, 24 Deno tests/15 payment substeps and 11 native PostgreSQL 17.6 checks. Exact evidence is in [evidence/beta-ci-20261019.json](evidence/beta-ci-20261019.json).

Native concurrency and synthetic role/data/privilege backup restoration into a separate fresh PostgreSQL cluster are now verified in CI. Both clusters stop and a PUBLIC-grant negative control passes. Actual hosted backup recovery, Auth/Storage services and object bytes remain unverified. The current frontend requires still-unapplied Beta RPCs; do not deploy it against the unchanged hosted database.

This is development preparation, not launch approval. PR #2 remains draft, main is unchanged, and no hosted write, runtime deployment, provider request, invitation, publishing or billing activation occurred. [The current handoff](LOCAL_BETA_HANDOFF_20261019.md) supersedes the historical delivery/test status below. The exact SQL/runtime/identity/provider stages in [PRIVATE_BETA_RELEASE_REVIEW.md](PRIVATE_BETA_RELEASE_REVIEW.md) remain unapproved.

## Current release candidate — 13 October 2026

The synchronized 3f1ca14 checkpoint is pushed and CI passed. Final local hardening includes sanitized Auth/AI errors, translated access-outage recovery, bounded browser requests and a read-only source-manifest CI gate. The proposed first Beta remains free text generation/drafts/editing/review with new media uploads disabled. This completes the current local preparation; the live approval/acceptance stages below remain pending.

Checkpoint c246e2f is pushed and both push/PR CI passed. The latest safety continuation prepares expiring invite-only database access, trusted AI usage/cost estimates with conservative configurable limits, bounded coded runtime reports and a reviewed operational rollback. New uploads and voice recording are disabled for the first text-draft Beta; existing objects are retained. No live changes or deployment occurred.

The exact current handoff is [PRIVATE_BETA_RELEASE_REVIEW.md](PRIVATE_BETA_RELEASE_REVIEW.md), with source hashes in deployment/beta-review.json. It supersedes older table entries below concerning public signup, unavailable local instrumentation and pushing c246e2f. Hosted instrumentation is still unavailable until approved SQL/runtime changes are applied. Native concurrency, hosted Auth/Storage/gateway checks, provider no-charge proof and native Arabic/accessibility acceptance remain blockers.

Next live approval: after recoverable-backup/history/impact review, apply only the three named SQL files to nkfecpdegcmsapvbviky with AI/uploads disabled, zero request/budget limits and no membership/admin assignment. Restrictive access immediately blocks unlisted current accounts. Auth settings, test memberships, owner privileges, deployment, provider use and real invitations require separate approval.

Status: NOT approved to launch. Confirmed project: nkfecpdegcmsapvbviky. Read-only GitHub verification found compatibility commit 4f4790ac63e1ab3ad86a39903a3b9e29096302e4 on chore/security-and-approval-hardening; CI run 38288727459 succeeded. PR #2 remains draft/unmerged.

## Proposed first Beta scope

An invited free cohort testing signed-in AI drafts, editing/manual approval and calendar planning. Private uploads are included only if the owner approves their safety and maintenance plan; otherwise disable them for the initial Beta before deployment. Social connections/publication, checkout/payment activation, public registration and automatic retention workers are outside this proposed scope. This is a proposed scope, not owner approval.

## Exact core Beta blockers

| Blocker | Evidence / current state | Required next action |
| --- | --- | --- |
| Development candidate delivery | New branch pushed; source 3c617ad passes both CI jobs, including native acceptance | Complete: keep the verified source isolated from main and deployment |
| Hosted recovery | Synthetic native dump/restore passes; actual hosted backup/services/object bytes remain unverified | Obtain authorized hosted backup/recovery evidence before hosted SQL |
| Beta access and destination | Signup is removed from the prepared UI; no approved Beta URL/cohort and hosted invite-only enforcement is not applied | Owner chooses the URL and invited cohort; review hosted signup/email/CAPTCHA/rate controls and approve any configuration changes |
| Server scheduling protection | Read-only catalog check finds no aa_require_prior_approval trigger | Review backup/restore and historical migration mappings, then separately approve applying ONLY 20261013000000_require_prior_approval.sql. No blind db push/history repair |
| Runtime release permission | Prepared frontend/generator changes are not deployed; existing hosted generator is a different version | Approve exact release commit, host, origin/redirect configuration and staged/limited deployment separately. A main merge is not technically required for a branch-based Beta |
| Integration acceptance | Node/PGlite/Deno/browser/native CI passes; hosted runtime acceptance is pending | After approval, use authorized test accounts/data to verify email confirmation/recovery, revoked sessions, two-user RLS, revision conflicts, quota/CORS, actual Storage limits and real Gemini output. These tests can write test data/consume quota, so are not read-only |
| Media safety/maintenance | Container checks exist; quarantine/scanning is not live; owner-side deletion/retention is needed because there is no client DELETE policy | Approve a controlled upload/maintenance plan and applicable safety checks, or disable uploads for this Beta. Never run a cleanup worker or delete files without permission |
| User acceptance and operations | Native Arabic/critical accessibility acceptance, approved support/privacy/data-retention arrangements and measured provider-spend limits are not signed off | Review critical flows with Beta users, publish only owner-approved user information, and approve monitoring/limits. Per-user quotas are not a verified total-project spend cap |

Live read-only checks in this preparation confirmed publishing_enabled=false and billing_enabled=false. No server environment values, API keys or credential records were read. Environment gates were not independently inspected; the closed database gates are sufficient to keep the existing two-gate publishing/billing operations closed. No live migration, data write, deployment or launch-control change was made.

## Prepared browser headers

scripts/security-headers.mjs reads only deployment/target.json (public identity/origin) and writes deployment/security-headers.json and public/_headers locally. It reads no credential or .env files, performs no networking and deploys nothing. The build includes these artifacts; hosts supporting _headers can use that format, and other hosts must apply the JSON values explicitly after approval.

The policy restricts scripts/fonts to self, denies embedded frames/objects, permits only the intended Supabase API/private media origins, suppresses referrers, denies camera/location/browser payment access, and permits same-origin microphone use for voice notes. Inline CSS is retained for existing React styles; inline scripts/eval are not allowed. External Google font loading was removed. No CAPTCHA script/frame origin is allowed because this branch currently has no CAPTCHA widget; adding one requires code/header review and tests before enabling it.

Header tests fulfill all private preview requests locally and never contact Supabase. Successful local CSP fixtures do not prove a hosting provider will serve the headers: verify real response headers only after approved deployment. HSTS applies to the selected HTTPS host; no subdomain/preload commitment is made.

## Approval handoff and rollback

Before any live action, present the exact candidate commit, reviewed migration, backup/restore evidence, chosen host/origins, invited test accounts/cohort, spend boundaries and smoke-test plan. Obtain separate authorization for database changes, deployment and live fixture tests. Deployment permission never activates publishing or billing.

If acceptance fails, stop inviting users and use the approved previous frontend/function version; keep all customer data and existing policies. Only the newly added scheduling trigger/function have a narrow proposed rollback, described in BACKEND_COMPATIBILITY.md. Do not drop tables, reset the project, recreate buckets or start an automatic cleanup.

## Not blockers for the proposed draft/review Beta

Provider app reviews/OAuth credentials, paid plans, merchant documents, real social publication and payment activation are optional later phases. They remain disabled and require separate owner permission. Full native concurrency/load certification and broad accessibility certification are later scaling work; critical Beta flows and ownership/approval checks still must pass release acceptance.

## Owner monitoring continuation — 13 October 2026

Fetched development branch and verified checkpoint 06776a6 was already pushed (HEAD/origin divergence 0/0). Added a read-only, mobile-friendly aggregate dashboard with private server-managed admin membership and active-session authorization. Existing customer policies and backend protections are preserved. The new monitoring migration and owner assignment are NOT applied live. See OWNER_MONITORING.md for scope, rollback and acceptance. Cost/subscription/runtime-error instrumentation is still unavailable; do not interpret quota attempts as spend. No deployment, production data access, paid request, social/billing activation or main merge occurred.
