# Development roadmap

Reconciliation with work/content-system-2026-10-03 takes precedence over the earlier duplicate backend proposal. Existing deployed capabilities are preserved; no live operations are authorized by this roadmap.

| Area | State / next work |
| --- | --- |
| Backend identity | Confirmed; retain nkfecpdegcmsapvbviky and its recorded migration mappings |
| Compatibility | Locally implemented: named languages, media/revisions, caller quota, existing private bucket and protected lifecycle |
| Authentication/approval | Local regressions cover recovery/logout, revoked sessions, explicit reapproval, revision conflicts and scheduling |
| AI/media | Private attachment/voice-note editor preserved; runtime/HTTP tests use fixtures. Approved staged/live verification remains pending |
| Migrations | One additive prior-approval trigger prepared; historical migration reconciliation and owner approval required before application |
| Social/payment | Existing guarded code retained; local gates/replay checks pass. No publishing, payment activation or external credential setup |
| Release security | Scanning/quarantine, retention, full accessibility/native-speaker review and live gateway/log verification remain pending |

Next safe work: inspect pushed CI, review compatibility changes, and expand mocked browser coverage for authentication/media. Keep deployments, migration application, live fixture writes, main merges and activation behind separate owner approval. Do not replay historical SQL or create duplicate resources.
