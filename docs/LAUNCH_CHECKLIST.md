# Release checklist — separate owner approval required

## Current Beta safety handoff — 13 October 2026

- [x] Verify synchronized 3f1ca14 and retain original 02b1ec1 on a backup branch.
- [x] Sanitize authentication/AI SDK failures and add Arabic retry guidance for unavailable access checks.
- [x] Bound browser AI requests without automatic retries; remove the incorrect midnight-reset promise.
- [x] Verify critical frontend, backend, policy and header hashes through a read-only CI review gate.

- [x] Verify c246e2f pushed; push CI 38330765999 and PR CI 38330770147 successful.
- [x] Prepare expiring invite membership, restrictive RLS, safe coded monitoring and atomic AI usage/budget reservations locally.
- [x] Disable new uploads/recording and public signup in this candidate; add Arabic owner/recovery/access screens and mobile controls.
- [x] Prepare/test operational rollback retaining access guards, schema and all content/media data.
- [x] Prepare exact migration hashes and staged acceptance in PRIVATE_BETA_RELEASE_REVIEW.md / deployment/beta-review.json.
- [ ] Confirm backup/restore evidence, canonical mappings and impact on existing unlisted accounts before exact database-change approval.
- [ ] Separately approve hosted Auth/signup/redirect configuration, exact test UUID memberships/expiry and owner UUID privileges.
- [ ] Separately approve the exact pushed frontend/generator commit, host and origin configuration while AI/media remain paused.
- [ ] Approve bounded hosted test-data writes; verify isolation, revocation, conflicts, direct upload rejection and actual headers/gateway.
- [ ] Establish provider no-charge configuration and approve finite provider tests/limits separately. Rates in tests are synthetic.
- [ ] Sign off native Arabic/screen-reader/mobile acceptance and support/privacy/retention arrangements before real invitations.

These items supersede older continuation items below. No hosted action is authorized by local completion.

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

- [ ] Separately approve reviewed owner monitoring migration and exact owner Auth UUID membership assignment; verify authorized/unauthorized hosted access. See OWNER_MONITORING.md.
- [ ] Complete measured spend and redacted runtime-error monitoring before release acceptance.
