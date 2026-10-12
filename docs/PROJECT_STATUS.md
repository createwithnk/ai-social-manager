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
| Private media library and server uploads | Completed and tested locally | Shared MIME/signature checks, bounded server reads, signed previews, confirmation; live Storage unverified |
| Upload abuse/storage limits | Completed and tested locally | 5 attempts/UTC day, 100 MiB/user including pending reservations; clients cannot upload directly |
| Media attachments to posts | Not started | Library is independent of posts |
| Core Arabic interface and RTL navigation | Completed and tested locally | Label coverage and document-direction tests pass; visual/native-speaker verification and some dynamic error/date messages remain |
| Desktop/mobile browser workflows | Completed and tested in local preview | 4 tests passed; viewport, accessible names and mobile keyboard navigation fixed |
| Social OAuth and official publishing | Blocked | Provider app credentials/review and owner approval needed; no posting implementation enabled |
| Billing and paid subscriptions | Blocked | Provider/test account and business plan decisions needed; no live payment setup |
| Live Supabase identity verification | Blocked | Confirm whether `nkfecpdegcmsapvbviky` is the AasiFlowAI project |
| Push / PR CI execution | Blocked at last attempt | GitHub Git authentication unavailable; local commits preserved |

## Constraints and risks

- Apply migrations and deploy the matching frontend/function together only after project confirmation and explicit deployment approval. The new frontend selects language and approval columns; it requires the new schema.
- Existing approved/scheduled rows are not silently assigned approval evidence. They need explicit draft/review/approval before scheduling under the new trigger.
- Storage writes go through the verified-user Edge endpoint; direct authenticated uploads are denied. Header checks are not full decoding or malware scanning. A scanning/quarantine pipeline and abuse monitoring remain pre-launch work.
- Failed uploads count toward daily attempts. Failed tracking retains pending capacity conservatively for up to one hour. Refresh the library before retrying uncertain uploads; missing legacy size metadata is conservatively treated as 50 MiB.
- Media previews are bearer URLs valid for five minutes. Do not log or share them; deletion does not instantly revoke previously issued URLs.
- No distributed load test, real email/OAuth integration, live Supabase browser test, full accessibility certification or hosted-log audit has been performed. Local desktop/mobile preview tests and screenshot review passed.

## Exact continuation

1. Read ROADMAP.md, TEST_REPORT.md and LAUNCH_CHECKLIST.md. Check Git status before edits.
2. Restore GitHub authentication and push the development branch without merging or deploying. The latest attempt failed with `Cannot prompt because user interactivity has been disabled`; two earlier local development commits remain safe and unpushed.
3. Continue draft media attachments and provider separation. Run browser tests in local preview mode; keep live requests blocked until the owner confirms project identity.
4. After confirmation, inspect existing project metadata/configuration read-only and request only the credentials or deployment permission actually needed. Never paste secrets into chat.
5. Review/apply migrations and deploy only with explicit owner approval; rerun live auth/RLS/CORS/quota/storage tests afterward.

Original pre-session local edits remain in the named Git stash on `main`; do not blindly apply them over the development branch.
