# AasiFlowAI project status

Updated: 12 October 2026. Development only; not launch-ready or deployed by this agent.

| Feature | Status | Evidence / limitation |
| --- | --- | --- |
| Build, lint, strict Edge handler types | Completed and tested locally | See TEST_REPORT.md |
| Automated CI | Implemented but untested remotely | Pinned checkout/setup-node, read-only token, no deployment steps |
| Signup/login, email-confirmation handling, recovery/logout | Completed and tested with mocks | Actual email delivery, auth settings and browser flow require confirmed Supabase project |
| Post owner isolation and approval/scheduling rules | Completed and tested in local PostgreSQL | New trigger/migration not applied to Supabase |
| Gemini generator | Completed and tested with mocked provider | No real provider calls, secrets inspected, or deployments |
| Arabic/English content, Gulf-market targeting, RTL content editor | Completed and tested locally | Full Arabic interface translation remains separate work |
| AI attempts and abuse limits | Completed and tested locally | Atomic 20 attempts/user/UTC day; server-only RPC; migration required |
| Private media library | Completed and tested locally | MIME/size/signature validation, signed previews, confirmation; no live storage verification |
| Media attachments to posts | Not started | Library is independent of posts |
| Core Arabic interface and RTL navigation | Completed and tested locally | Label coverage and document-direction tests pass; visual/native-speaker verification and some dynamic error/date messages remain |
| Social OAuth and official publishing | Blocked | Provider app credentials/review and owner approval needed; no posting implementation enabled |
| Billing and paid subscriptions | Blocked | Provider/test account and business plan decisions needed; no live payment setup |
| Live Supabase identity verification | Blocked | Confirm whether `nkfecpdegcmsapvbviky` is the AasiFlowAI project |
| Push / PR CI execution | Blocked at last attempt | GitHub Git authentication unavailable; local commits preserved |

## Constraints and risks

- Apply migrations and deploy the matching frontend/function together only after project confirmation and explicit deployment approval. The new frontend selects language and approval columns; it requires the new schema.
- Existing approved/scheduled rows are not silently assigned approval evidence. They need explicit draft/review/approval before scheduling under the new trigger.
- Storage MIME limits are metadata-based. Client signature checks can be bypassed by direct API callers; a server scanning/quarantine pipeline and durable storage quotas are still needed before public uploads.
- Media previews are bearer URLs valid for five minutes. Do not log or share them; deletion does not instantly revoke previously issued URLs.
- No distributed load test, real email/OAuth integration, mobile browser test, or hosted-log audit has been performed.

## Exact continuation

1. Read ROADMAP.md, TEST_REPORT.md and LAUNCH_CHECKLIST.md. Check Git status before edits.
2. Restore GitHub authentication and push the development branch without merging or deploying.
3. Continue unblocked server media validation, draft media attachments, and browser testing in local preview mode. Keep live requests blocked until the owner confirms project identity.
4. After confirmation, inspect existing project metadata/configuration read-only and request only the credentials or deployment permission actually needed. Never paste secrets into chat.
5. Review/apply migrations and deploy only with explicit owner approval; rerun live auth/RLS/CORS/quota/storage tests afterward.

Original pre-session local edits remain in the named Git stash on `main`; do not blindly apply them over the development branch.
