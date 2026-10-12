# Release checklist — separate owner approval required

- [x] Confirm project identity: nkfecpdegcmsapvbviky, matching repository history and metadata.
- [x] Reconcile code with existing tables/RPCs/bucket and preserve current RLS/lifecycle/gated functions locally.
- [x] Verify compatibility commit 4f4790a and its CI (run 38288727459 passed). PR #2 remains draft/unmerged.
- [ ] Push and verify the later Beta header/docs checkpoint through GitHub Desktop.
- [ ] Owner chooses Beta URL, invited cohort, feature scope, support/data-handling arrangements and spend limits; verify signup/invite restrictions.
- [ ] Review current backup/restore procedures and migration history mappings in an isolated environment.
- [ ] Review and approve ONLY the new scheduling trigger if needed. Do not replay already-applied historical migrations or archived duplicate proposals.
- [ ] Approve staged/runtime deployment separately; test real JWT gateway/CORS, email recovery, two-user RLS, quota, revision conflicts and actual Storage limits afterward.
- [ ] Verify real Gemini access/response behavior, server secrets, hosted-log redaction and measured spend limits without creating new charges automatically.
- [ ] Review scanning/quarantine, owner-authorized retention, accessibility/native-language quality, support and privacy obligations.
- [x] Prepare CSP/referrer/MIME/framing/permissions headers locally and verify their browser behavior with mocked requests; no remote font dependency.
- [ ] Confirm the selected hosting platform actually serves these headers and the approved Beta origin matches Auth redirects/CORS after approved deployment.
- [ ] Verify existing publishing/billing gates remain closed unless separately authorized. No public launch, social publication, payment activation, merchant-document submission or worker scheduling occurs automatically.

This reconciliation made no live migrations, policy changes, production-data writes, Edge deployments, merges, social posts or billing activation. Deployment approval does not implicitly authorize publishing or billing. See BACKEND_COMPATIBILITY.md for migration scope and proposed rollback.

See BETA_LAUNCH_PLAN.md. Publishing and billing database gates were read-only verified false. They remain outside the proposed core Beta and do not need activation for it.
