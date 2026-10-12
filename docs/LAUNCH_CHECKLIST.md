# Release checklist — separate owner approval required

- [x] Confirm project identity: nkfecpdegcmsapvbviky, matching repository history and metadata.
- [x] Reconcile code with existing tables/RPCs/bucket and preserve current RLS/lifecycle/gated functions locally.
- [ ] Push this checkpoint and verify its CI; do not merge main without separate approval.
- [ ] Review current backup/restore procedures and migration history mappings in an isolated environment.
- [ ] Review and approve ONLY the new scheduling trigger if needed. Do not replay already-applied historical migrations or archived duplicate proposals.
- [ ] Approve staged/runtime deployment separately; test real JWT gateway/CORS, email recovery, two-user RLS, quota, revision conflicts and actual Storage limits afterward.
- [ ] Verify real Gemini access/response behavior, server secrets, hosted-log redaction and measured spend limits without creating new charges automatically.
- [ ] Review scanning/quarantine, owner-authorized retention, accessibility/native-language quality, support and privacy obligations.
- [ ] Verify existing publishing/billing gates remain closed unless separately authorized. No public launch, social publication, payment activation, merchant-document submission or worker scheduling occurs automatically.

This reconciliation made no live migrations, policy changes, production-data writes, Edge deployments, merges, social posts or billing activation. Deployment approval does not implicitly authorize publishing or billing. See BACKEND_COMPATIBILITY.md for migration scope and proposed rollback.
