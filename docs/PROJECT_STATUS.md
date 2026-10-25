# AasiFlowAI project status

## Targeted UI acceptance continuation — 22 October 2026

The prior backup/checkpoint commit `8683cff` passed [CI 39810575643](https://github.com/createwithnk/ai-social-manager/actions/runs/39810575643). A subsequent UI review fixes keyboard focus on screen changes, announces the active navigation item and completes selected-locale Calendar/details labels. Two new browser scenarios run on desktop and mobile; use current-head CI for their result. Local lint, app build, browser TypeScript, 106 Node tests and 81 SQL checks pass. Hosted recovery/setup/release/provider acceptance and human/cohort decisions remain outstanding; see [current checkpoint](CONTINUE_AASIFLOWAI.md). No launch, hosted configuration or other project was changed.

## Read-only hosted continuation — 22 October 2026

Only AasiFlowAI was accessed. Fresh project/catalog/advisor reads confirm healthy PostgreSQL 17.6, four unchanged historical migrations, protected-table RLS and closed publishing/billing controls. The six private no-policy INFO findings retain no anon/authenticated table DML privileges. Leaked-password protection remains a hosted warning; no paid upgrade or Auth change was made. All three proposed Beta updates remain unapplied and newer runtime release remains held. See [sanitized hosted evidence](evidence/hosted-readonly-20261022.json).

Added a fixed-project, GET-only backup-inventory command with deadlines, streamed-size limits, redirect rejection, sanitized output and no fallback to unrelated credentials. Ten new mocked checks pass; the full local suite passes 106 Node tests and 81 SQL checks, plus lint/manifest/whitespace checks. This does not certify a hosted backup: the connected MCP has no backup-list action and the task-specific read token is absent.

The durable [continuation checkpoint](CONTINUE_AASIFLOWAI.md) and [scope policy](../deployment/continuation.json) preserve finished work, held actions, the exact next blocker and resumption instructions. Account quota-reset events are not exposed; any scheduled continuation is an attempt subject to actual usage/access limits, not a quota bypass. Preserve DarulIlm isolation and the unavailable laptop checkpoint. Current-commit CI must still be read from GitHub rather than inferred from older results.

## Development checkpoint — 19 October 2026

The authorized development work is pushed to [fix/beta-readiness-20261019](https://github.com/createwithnk/ai-social-manager/tree/fix/beta-readiness-20261019). Code commit `3c617adfb2eeb008b90a363a447797bbc236a240` passed [GitHub CI 39267865055](https://github.com/createwithnk/ai-social-manager/actions/runs/39267865055), including both validation and native PostgreSQL jobs. PR #2 remains draft on its previous branch; main was not merged and nothing was deployed.

Completed: fresh review before saving, single-use draft consent, confirmation before approved/scheduled content becomes a draft, read-only View/Back, revision-conflict retention, displayed-time rescheduling, and disabled concurrent Calendar actions during a write. Existing save/edit changes were preserved. The source manifest covers persistence/workflow/dependencies and native CI tooling; approval stays false and the three reviewed SQL payload hashes are unchanged.

Verified in CI: 96 Node tests, 81 isolated PGlite SQL checks, 26 desktop/mobile browser cases, 24 pinned Deno tests (15 payment steps), build, lint, type checks and manifest verification. The PostgreSQL 17.6 job passes 11 additional native checks: exact SQL application/rollback, retained synthetic rows/media/revisions, invite isolation, eight independently overlapping budget requests, and pg_dump/pg_restore into a fresh database. Both temporary clusters stopped successfully. See [test report](TEST_REPORT.md) and [recorded evidence](evidence/beta-ci-20261019.json).

The native rehearsal restores password-free roles into a separate fresh cluster and compares role attributes/memberships plus schema, table, function and default privileges. It detects a deliberately added PUBLIC execute grant, then rolls that change back. Both test clusters stop successfully. Synthetic Auth/Storage catalogs still do not certify an actual recoverable hosted backup, Auth/Storage services or stored-object bytes. The earlier root-only local-container blocker was resolved by running native acceptance in isolated GitHub CI, without bypassing PostgreSQL protections.

Read-only hosted metadata earlier on 19 October confirmed ACTIVE_HEALTHY, PostgreSQL 17.6, unchanged four historical migration versions, RLS on posts/ai_usage/storage.objects, and publishing/billing false. The three proposed scheduling/monitoring/Beta additions are still unapplied. No live SQL writes, memberships, provider calls, charges, invitations or deployment occurred.

Remaining release work: authorized hosted backup/recovery and integration acceptance; exact SQL/history/existing-user-impact review; approved Auth/identity/runtime setup; provider no-charge proof; and human Arabic/screen-reader/cohort/privacy/support acceptance. Do not deploy this frontend against the unchanged hosted database: required Beta RPCs are absent. The release review remains unapproved.

The unavailable laptop-only `21e8dce` was not overwritten or claimed synchronized. Earlier checkpoints below are history; [the current handoff](LOCAL_BETA_HANDOFF_20261019.md) supersedes their delivery/native-test status.

## Current checkpoint — 13 October 2026

Continuation from synchronized `3f1ca14`: both push CI 38333292992 and PR CI 38333296235 passed; backup branch codex/beta-safety-local-02b1ec1 preserves the prior local checkpoint. The final local hardening removes raw Auth/SDK error details, distinguishes access-service outages from invitation denials, bounds browser AI transport to 60 seconds without retry, and avoids promising a midnight reset while unknown usage carries forward. Arabic messages and denial/recovery acceptance are extended. `npm run review:beta` verifies the source/policy/header manifest without writes or networking; CI uses this gate.

The local preparation is complete for this text-draft candidate. Remaining blockers require hosted approval/evidence or human acceptance: recoverable backup/native PostgreSQL review, exact SQL, hosted Auth/membership/owner setup, deployment and test-data permission, verified provider no-charge configuration, native Arabic/screen-reader review and cohort/support/privacy/retention decisions. See PRIVATE_BETA_RELEASE_REVIEW.md. Earlier checkpoint entries below are historical.

Remote checkpoint `c246e2f` is confirmed pushed; push CI 38330765999 and PR CI 38330770147 passed. The subsequent local Beta-safety candidate adds coded runtime monitoring, trusted numeric AI token/outcome measurements, cost estimates with atomic/configurable reservations (including unresolved UTC carryover), expiring invite membership guards, blocked self-signup, disabled new uploads/recording, Arabic owner/recovery screens and mobile accessibility improvements.

No live SQL, memberships/admin assignments, deployment, provider calls, charges, main merge, publishing or billing activation occurred. AI/media default off and request/budget limits default zero. Prices are owner-configured estimates, not verified invoices. Existing canonical hashes, ownership/session protections, quota accounting and revision/approval workflows are preserved. The new restrictive policies will deny unlisted existing accounts after approved application, so review that impact first.

The new proposal stays in supabase/proposals for explicit review, outside the active CLI migration directory. Its tested operational rollback pauses new RPCs while keeping invite guards and all data. See [release review](PRIVATE_BETA_RELEASE_REVIEW.md) and deployment/beta-review.json for exact SQL hashes, staged acceptance, remaining provider/no-charge and native Arabic/accessibility checks, and separate approvals. This section supersedes older continuation instructions below; the earlier checkpoints remain as history.

Updated: 12 October 2026. Compatibility reconciliation is local development work; no live project changes or deployment were performed.

The owner-confirmed project is `nkfecpdegcmsapvbviky`. Read-only checks matched the local URL, base posts schema, deployed functions and all four historical migration mappings in `work/content-system-2026-10-03`. Remote development commit `4f4790a` is confirmed on the branch; CI run 38288727459 passed. PR #2 remains draft and unmerged.

| Area | Current state |
| --- | --- |
| Backend baseline | Existing migrations, session-aware RLS, lifecycle/revision locks and gated social/payment functions retained from the work branch |
| Posts | Selects only existing columns; maps English/Arabic/Hindi/Urdu; preserves media and returned revisions; owner/revision-scoped UPDATE, INSERT for new posts |
| Approval | Fresh checkbox/fingerprint required after any edit, including attachments; editing approved content saves a draft and uses the returned revision |
| AI | Existing has_active_session and caller-authenticated consume_ai_quota; no duplicate credit RPC or service key in the generator; bounded request/provider bodies and timeouts retained |
| Private media | Existing post-media bucket, 10 MiB image/video/audio, owner paths, opaque names, no upsert, expiring previews; attachment/voice-note editor restored |
| Media deletion | Disabled because the existing Storage policies have no client DELETE grant; detach never deletes the stored object |
| Social/payment code | Existing server gates, encrypted credentials, replay protections, queue leases and webhook checks retained; no activation or live endpoint invocation |
| Schema additions | One additive prior-approval scheduling trigger prepared and locally tested; NOT applied live |
| Duplicate proposal | Earlier ai_daily_usage, aasiflow-media and upload reservation migrations/function archived outside active migration/function directories |
| Market targeting | Prompt-only preference, not a posts column; not fabricated or stored as approval evidence. Existing deployed AI may ignore it until an approved function update |
| Beta browser security | Host header artifacts prepared locally; no remote font dependency. Browser fixture tests verify CSP blocks inline scripts/frames and permits mocked private media |
| Live launch controls | Read-only inspection confirms publishing_enabled=false and billing_enabled=false; environment values/secrets were not read or changed |
| Live scheduling guard | Read-only catalog check confirms aa_require_prior_approval is absent; the pending migration remains unapplied |

See [compatibility plan](BACKEND_COMPATIBILITY.md) and [test report](TEST_REPORT.md). The work branch's pending quarantine/retention changes are not promoted by this reconciliation.

## Remaining blockers and continuation

1. The backend compatibility checkpoint is pushed and CI passed. Push/verify the subsequent Beta header/docs checkpoint through GitHub Desktop; keep PR #2 draft and do not merge main.
2. Review/reconcile historical migration IDs before any CLI database push. The base posts schema existed before recorded migrations; replaying the directory against live is unsafe.
3. Owner approval is required before applying the single new trigger or deploying the updated generator/frontend. Existing social/payment runtime settings must remain unchanged.
4. A staged/live test of the new code is pending; local HTTP and SQL mocks do not certify the hosted gateway, email, actual Storage enforcement or concurrent production behavior.
5. Live compatibility with the current generator requires named language values, already handled. Gulf prompts and additional local response hardening require the proposed generator update; never silently assume deployment occurred.
6. Use BETA_LAUNCH_PLAN.md for the exact core Beta blockers. Social-provider and merchant credentials do not block a free draft/review Beta with those features disabled. Upload safety/maintenance and critical Arabic/accessibility acceptance still need scope-specific review.

The pre-session local work remains in its named Git stash; do not blindly reapply it. No existing customer data was read or changed; inspection used catalog/configuration metadata only.

## Owner monitoring continuation — 13 October 2026

Fetched development branch and verified checkpoint 06776a6 was already pushed (HEAD/origin divergence 0/0). Added a read-only, mobile-friendly aggregate dashboard with private server-managed admin membership and active-session authorization. Existing customer policies and backend protections are preserved. The new monitoring migration and owner assignment are NOT applied live. See OWNER_MONITORING.md for scope, rollback and acceptance. Cost/subscription/runtime-error instrumentation is still unavailable; do not interpret quota attempts as spend. No deployment, production data access, paid request, social/billing activation or main merge occurred.
