# Hosted backup review

Project: AasiFlowAI / `nkfecpdegcmsapvbviky`. This procedure does not authorize a live restore, SQL change, paid upgrade or deployment.

## Read-only inventory

Run `npm run review:backups` with a securely provided, AasiFlowAI-restricted Management API token in `AASIFLOW_SUPABASE_READ_TOKEN`. The [official endpoint](https://supabase.com/docs/reference/api/v1-list-all-backups) is GET `/v1/projects/{ref}/database/backups`; fine-grained permission is `backups_read` (OAuth scope `database:read`).

The command has one fixed destination. It accepts no CLI arguments, loads no .env file, and ignores generic Supabase/Gemini credentials. It never lists other projects, follows redirects, retries requests, restores, downloads backup contents or writes configuration. Its ten-second deadline covers headers/body; decompressed responses are limited to 256 KiB. Only sanitized status/timestamp/kind/count fields are returned.

Exit 0 means metadata was received. Exit 2 means access, scope, transport or format validation blocked inspection. The JSON always keeps `hostedBackupVerified=false` and `storageObjectsVerified=false`, including when the API lists completed backups. Save optional metadata receipts under ignored `test-results/`; review any sanitized evidence before committing it. Never commit tokens, actual dumps or signed URLs.

The existing connected Supabase MCP can inspect catalog metadata but exposes no backup-list/download action. On 22 October the task-specific token is absent, so no backup availability was inferred. Do not substitute a key from another project or extract credentials through database files/functions.

## Recovery evidence still required

According to [Supabase's backup guide](https://supabase.com/docs/guides/platform/backups), automatic daily backups are available on paid plans; free projects should maintain off-site logical exports. The current project's recoverable backup is unverified, not proven missing. Do not purchase or enable paid backup services.

An authorized export/recovery review must establish:

- Exact source project, source time, engine/tool compatibility and verified archive digest.
- Private storage/access for the real export, with no dump, role password or customer records in Git.
- A new isolated restore destination; never use the hosted source or an existing user's database as the target.
- Exact migration/history mapping, roles/ownership/grants, policies/RLS, lifecycle/approval behavior and retained revisions/content.
- Real Auth session/identity dependencies and separately protected service configuration.
- Storage object bytes, retention and referenced metadata: a database backup contains metadata, not the actual Storage objects.
- Actual verification output, failures, cleanup of the disposable services, and an honest list of unverified components.

The existing native CI proves a synthetic rehearsal, not these hosted dependencies. Auth settings, membership/owner assignment, SQL, runtime release, provider use and invitations remain separately held in the release review.
