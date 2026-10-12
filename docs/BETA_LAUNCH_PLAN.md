# AasiFlowAI Beta launch preparation

Status: NOT approved to launch. Confirmed project: nkfecpdegcmsapvbviky. Read-only GitHub verification found compatibility commit 4f4790ac63e1ab3ad86a39903a3b9e29096302e4 on chore/security-and-approval-hardening; CI run 38288727459 succeeded. PR #2 remains draft/unmerged.

## Proposed first Beta scope

An invited free cohort testing signed-in AI drafts, editing/manual approval and calendar planning. Private uploads are included only if the owner approves their safety and maintenance plan; otherwise disable them for the initial Beta before deployment. Social connections/publication, checkout/payment activation, public registration and automatic retention workers are outside this proposed scope. This is a proposed scope, not owner approval.

## Exact core Beta blockers

| Blocker | Evidence / current state | Required next action |
| --- | --- | --- |
| Latest release candidate delivery | Compatibility commit/CI verified; later Beta header/docs changes are local until pushed | Push with GitHub Desktop and verify the new CI. No transfer helper is needed |
| Beta access and destination | No approved Beta URL/cohort/access model supplied; current UI offers signup, and hosted invite-only enforcement is unverified | Owner chooses the URL and invited cohort; review signup/email/CAPTCHA/rate controls and approve any hosted configuration changes |
| Server scheduling protection | Read-only catalog check finds no aa_require_prior_approval trigger | Review backup/restore and historical migration mappings, then separately approve applying ONLY 20261013000000_require_prior_approval.sql. No blind db push/history repair |
| Runtime release permission | Prepared frontend/generator changes are not deployed; existing hosted generator is a different version | Approve exact release commit, host, origin/redirect configuration and staged/limited deployment separately. A main merge is not technically required for a branch-based Beta |
| Integration acceptance | Local Node/PostgreSQL/Deno/browser checks pass, but not the newly deployed hosted runtime | After approval, use authorized test accounts/data to verify email confirmation/recovery, revoked sessions, two-user RLS, revision conflicts, quota/CORS, actual Storage limits and real Gemini output. These tests can write test data/consume quota, so are not read-only |
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
