# Continue AasiFlowAI

Updated: 22 October 2026. Read this file before resuming work.

## Scope

Only `createwithnk/ai-social-manager`, development branch `fix/beta-readiness-20261019`, and Supabase `nkfecpdegcmsapvbviky` are in scope. Read [deployment/continuation.json](../deployment/continuation.json). Do not inspect, change, deploy or reuse secrets from DarulIlm or any other project.

The user authorized routine development, isolated testing, checkpoints and pushing reviewed development work. Public launch, hosted deployment, live SQL/Auth/identity changes, paid/provider calls, billing, posting and real invitations remain held. Continue safe work without repeatedly requesting routine permission.

## Verified starting point

Remote starting checkpoint: `4f339abed0634281123771fc51cfaec5e83c4dc6`. Its CI passed 96 Node tests, 81 SQL checks, 24 Deno tests/15 payment steps, 26 browser cases and 11 native PostgreSQL checks. Native restore used synthetic catalogs and two disposable clusters, not an actual hosted backup. Preserve unavailable laptop checkpoint `21e8dce`; do not claim it synchronized.

Fresh hosted evidence: [hosted-readonly-20261022.json](evidence/hosted-readonly-20261022.json). Healthy PostgreSQL 17.6; four historical migration mappings unchanged; protected tables have RLS; private application-role DML remains denied. Publishing/billing are false. The three Beta additions remain absent. Existing generator version 4 is active; this does not mean the newer source was deployed.

The advisor's six private-table no-policy INFO findings reflect closed tables with no client DML grants; do not add allow policies to silence them. Leaked-password protection is disabled and is a hosted configuration warning, not fixed here. Its current vendor feature requires a paid plan; no upgrade was authorized. Vendor PostgreSQL patch/extension compatibility review remains pending.

## This continuation

- Prepared the fixed-project, GET-only `npm run review:backups` command and 10 passing focused tests. The complete local suite now passes 106 Node tests plus 81 SQL checks; lint and manifest/whitespace checks pass.
- Response size, elapsed time, redirects, errors and output fields are bounded; secrets and signed URLs are omitted.
- Other project IDs fail before any request; unrelated Supabase environment keys are not reused.
- Actual inventory remains blocked because `AASIFLOW_SUPABASE_READ_TOKEN` is absent and the connected MCP has no backup-list action.
- `inventoryVerified` is separate from `hostedBackupVerified`; listing a completed backup never certifies recovery.
- Require the current remote head's full CI to pass before treating any new commit as tested. The live-receipt JSON and prior CI evidence are different scopes.

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
