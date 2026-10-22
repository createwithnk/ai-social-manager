# Continue AasiFlowAI

Updated: 23 October 2026. Read this file before resuming work.

## Scope

Only `createwithnk/ai-social-manager`, development branch `fix/beta-readiness-20261019`, and Supabase `nkfecpdegcmsapvbviky` are in scope. Read [deployment/continuation.json](../deployment/continuation.json). Do not inspect, change, deploy or reuse secrets from DarulIlm or any other project.

The user authorized routine development, isolated testing, checkpoints and pushing reviewed development work. Public launch, hosted deployment, live SQL/Auth/identity changes, paid/provider calls, billing, posting and real invitations remain held. Continue safe work without repeatedly requesting routine permission.

## Current verified CI checkpoint — 23 October 2026

Source commit `3c8d39666f9437bcac61ce9b0477e2aba8245dc9`, tree `1b04a09306512332bde32e850e1d7e8537e09618`, is confirmed on the development branch. The previously queued [CI 39815151280](https://github.com/createwithnk/ai-social-manager/actions/runs/39815151280) completed successfully. Both job logs verify 106 Node tests, 81 isolated SQL checks, 24 Deno tests/15 payment steps, 30 desktop/mobile browser cases and 11 synthetic native PostgreSQL checks, plus lint, TypeScript, build and manifest verification. See the [dated CI receipt](evidence/beta-ci-20261023.json).

The new keyboard and Arabic-calendar scenarios passed on both desktop and mobile. This closes the pending automated browser verification; native Arabic wording and actual screen-reader acceptance are still required. Existing passing suites were read from CI rather than rerun. Any later code change needs its own verification; documentation-only receipt commits do not replace the tested source SHA above.

The next prerequisite is unchanged: `AASIFLOW_SUPABASE_READ_TOKEN` is absent and no connected backup-list action is available. Backup inventory, hosted recovery and actual Storage object bytes remain unverified; backup availability is unknown. No held action was performed. Preserve the existing source checkpoints and wait for newly available scoped access/artifacts or a new actionable failure; do not invent features or repeatedly audit unchanged state.

## Earlier verified starting point

Remote starting checkpoint: `4f339abed0634281123771fc51cfaec5e83c4dc6`. Its CI passed 96 Node tests, 81 SQL checks, 24 Deno tests/15 payment steps, 26 browser cases and 11 native PostgreSQL checks. Native restore used synthetic catalogs and two disposable clusters, not an actual hosted backup. Preserve unavailable laptop checkpoint `21e8dce`; do not claim it synchronized.

Fresh hosted evidence: [hosted-readonly-20261022.json](evidence/hosted-readonly-20261022.json). Healthy PostgreSQL 17.6; four historical migration mappings unchanged; protected tables have RLS; private application-role DML remains denied. Publishing/billing are false. The three Beta additions remain absent. Existing generator version 4 is active; this does not mean the newer source was deployed.

The advisor's six private-table no-policy INFO findings reflect closed tables with no client DML grants; do not add allow policies to silence them. Leaked-password protection is disabled and is a hosted configuration warning, not fixed here. Its current vendor feature requires a paid plan; no upgrade was authorized. Vendor PostgreSQL patch/extension compatibility review remains pending.

## This continuation

- The backup/checkpoint commit `8683cffaacb4de662921d598d7b8d2e2bad15d16` is confirmed pushed; [CI 39810575643](https://github.com/createwithnk/ai-social-manager/actions/runs/39810575643) passed both jobs. Do not repeat that delivery work.
- Prepared the fixed-project, GET-only `npm run review:backups` command and 10 passing focused tests. The complete local suite now passes 106 Node tests plus 81 SQL checks; lint and manifest/whitespace checks pass.
- Response size, elapsed time, redirects, errors and output fields are bounded; secrets and signed URLs are omitted.
- Other project IDs fail before any request; unrelated Supabase environment keys are not reused.
- Actual inventory remains blocked because `AASIFLOW_SUPABASE_READ_TOKEN` is absent and the connected MCP has no backup-list action.
- `inventoryVerified` is separate from `hostedBackupVerified`; listing a completed backup never certifies recovery.
- Require the current remote head's full CI to pass before treating any new commit as tested. The live-receipt JSON and prior CI evidence are different scopes.

## Targeted UI acceptance continuation

The final UI review found two remaining automated-accessibility/localization gaps: changing workspace screens left keyboard focus on a removed or old control, and Arabic Calendar scheduling labels still used English/browser-default dates. Screen changes now focus the heading, the current navigation item is announced, and Calendar/details use the selected interface locale. Ordinary editor updates, language changes and the existing mobile-menu Escape behavior must retain their own focus. No post lifecycle, approval, schedule timestamp, SQL or server configuration changed.

Two new browser scenarios passed in both desktop and mobile projects (30 total browser cases). They cover View/Back/Edit/new-composer/navigation focus, no focus theft while typing/changing language, translated scheduling labels/details and an unchanged stored timestamp. Source `3c8d396` has passed full CI as recorded above; no result is inferred from the earlier backup/checkpoint run. Native Arabic wording/screen-reader acceptance still requires a human review.

Launch preparation still has five groups of outstanding evidence/actions: actual hosted recovery; exact hosted SQL and invite/owner/Auth setup; an approved private runtime destination/release; authorized real login/RLS/provider acceptance with no-charge boundaries; and human Arabic/accessibility plus cohort/support/privacy/retention acceptance. None is marked complete by these local UI fixes. Runtime deployment and public launch remain held; do not interpret the user's request to finish preparation as permission to launch.

## Next authorized work, in order

1. Inspect the current remote head and CI. If this continuation is already pushed and passing, skip its completed implementation/delivery work. Otherwise verify and push with expected-head checks. Preserve local changes and prior branches; never force-push or merge main.
2. If task-scoped backup read access or an authorized backup artifact becomes available, obtain a sanitized inventory receipt and plan isolated recovery using [HOSTED_BACKUP_REVIEW.md](HOSTED_BACKUP_REVIEW.md). Do not fabricate backup availability.
3. Rehearse actual authorized backup recovery only into a clearly isolated destination. Include role/grant contracts and separately review real Auth/Storage/object dependencies.
4. After backup/history/impact review, prepare the exact still-held SQL/runtime/identity/provider acceptance steps from [PRIVATE_BETA_RELEASE_REVIEW.md](PRIVATE_BETA_RELEASE_REVIEW.md). This checkpoint does not grant those permissions.
5. Complete native Arabic/critical accessibility acceptance and cohort/privacy/support decisions before invitations.

Do not add unrelated features, rerun unchanged passing checks solely to fill time, or weaken gates because a prerequisite is missing.

## Resuming after an interruption

Read the current remote branch and this file; a stale local HEAD is not the current source of truth. Inspect the latest CI result before coding. If another run or a dirty worktree is active, preserve it and avoid duplicate work. A remote update must compare its expected parent and complete source tree.

At every meaningful checkpoint and before yielding, report: completed changes, actual verification, outstanding tasks, the precise blocker, and the next task. Keep those facts in this file or a dated evidence entry so an interrupted run can continue.

No tool here observes account quota reset. A scheduled continuation can only attempt work at its configured cadence, subject to usage/access limits. Treat the scheduler's successful task record as proof of scheduling; this document alone creates no task. If a run finds no newly actionable authorized work, leave the repository unchanged and avoid repetitive notifications.
