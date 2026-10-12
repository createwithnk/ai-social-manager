# Backend compatibility reconciliation

Target: createwithnk/ai-social-manager, development branch chore/security-and-approval-hardening. Baseline: work/content-system-2026-10-03, commit 9c97e60. Project nkfecpdegcmsapvbviky was confirmed using owner confirmation and read-only metadata/schema/history checks on 12 October 2026.

| Contract | Previous development proposal | Retained live/work implementation |
| --- | --- | --- |
| Content language | en/ar stored directly | English/Arabic/Hindi/Urdu stored; UI codes mapped at the boundary |
| Posts metadata | market, approved_at/by | media, revision, updated_at; no invented approvals or mandatory new columns |
| AI quota | ai_daily_usage + consume_ai_credit(user_id), service role | ai_usage + consume_ai_quota(), authenticated caller and active session |
| Private bucket | aasiflow-media, 50 MiB videos | post-media, 10 MiB all supported media, image/video/audio MIME allowlist |
| Upload enforcement | New Edge upload and reservation tables | Existing Storage owner/session policies and serialized limits: 20 objects/user, 80/bucket |
| Approval/edit safety | Replacement lifecycle trigger | Existing private.guard_post_lifecycle preserved: immutable identity, revision increments, queued-job cancellation and processing locks |
| Publishing/payment | Absent from development branch | Existing gated functions preserved, no controls/settings changed |

Post writes preserve attachment metadata, omit unsupported columns, never overwrite creation time on updates, and compare the reviewed revision. Concurrent changes return a conflict instead of silently overwriting. The composer keeps each returned revision, including the draft produced when editing approved/scheduled content.

The generator verifies email/nonanonymous authentication plus the existing active-session RPC, reserves quota using the caller token, and downloads any attachment from the existing private bucket under that token. It checks owner paths, size, MIME and container signatures before sending bytes to Gemini. It retains exact CORS, safe errors, server-only API keys, bounded request/provider bodies and manual approval. Container signatures do not certify codecs or malware safety.

## Migrations and existing data

The four existing deployed migration payloads were restored unchanged and are checked against their recorded SHA-256 hashes. See supabase/migration-history.json for live timestamp mappings. The initial posts schema predates recorded history. No history repair, live replay, schema reset, SQL writes or policy changes were performed.

The three conflicting 12 October proposals are archived in docs/archive/unapplied-migrations. Their upload endpoint/tests are archived as text outside active Edge directories. Do not apply/deploy the archived proposal.

Only 20261013000000_require_prior_approval.sql is new. It adds a small BEFORE trigger requiring prior approved/scheduled status before scheduling and rejects scheduled inserts. It does not replace the lifecycle trigger, update/backfill/delete rows, change ownership policies, add columns/tables/buckets/RPCs, grant new privileges or enable launch controls. Existing approved/scheduled rows and legitimate transitions remain supported. Local tests exercise old records, both scheduling rejection paths and the existing revision lifecycle.

Before approval: review snapshots/restore procedures, compare the current catalog again and reconcile recorded migration versions. Apply ONLY the reviewed new migration after explicit owner permission; do not blindly run db push. Proposed rollback, only if separately approved: drop the new aa_require_prior_approval trigger on public.posts, then private.require_prior_approval(); keep the existing lifecycle trigger and all data/policies intact.

## Release boundaries

Code compatibility does not grant deployment permission. No existing functions were invoked live. Existing social/payment code is retained with its environment and database gates; local tests use synthetic fixtures and intercept provider calls with no Deno network permission. Deployed social/payment endpoints were observed previously, but their presence alone does not prove billing/publishing is activated.

Market preferences remain prompt-only and are not persisted; persistent market/audit metadata would need a separately reviewed design. Client media deletion remains unavailable. The source branch's unapplied quarantine/retention migration is not included in the active migration set, and its worker is not deployed or activated.
