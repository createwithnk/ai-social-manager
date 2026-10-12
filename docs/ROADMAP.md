# Development roadmap

The order favors working, tested features. “Tested” means local/mocked unless TEST_REPORT.md explicitly says otherwise.

| Phase | Status | Next concrete work |
| --- | --- | --- |
| 1. Audit/stability/CI | Completed locally; remote CI blocked | Push with authenticated Git; inspect the first CI result |
| 2. Authentication/security | Completed locally; live verification blocked | Confirm project, verify email/password policy and two-user live RLS |
| 3. AI generator | Completed locally; real AI blocked | Validate Gemini/configuration after approved deployment; add pluggable provider adapter when a second provider is chosen |
| 4. Media | Library completed locally | Attach media to drafts, add server validation/storage quotas, verify Storage API behavior |
| 5. Draft/approval/calendar | Completed locally | Browser regression and migrated-project integration tests |
| 6. Official social connections | Blocked | Choose provider apps and supply authorized OAuth test credentials; keep publishing disabled |
| 7. Business features | Usage credits implemented locally; billing blocked | Define plan allowances, choose a test payment provider, implement verified server webhook entitlements |
| 8. UI/localization | Core Arabic interface/RTL implemented and tested locally | Translate remaining dynamic messages; native-speaker and accessible browser checks |
| 9. Tests/security audit | In progress | Continue failure-path tests, server media validation, real Deno/gateway checks |
| 10. Launch readiness | Checklist drafted; launch blocked | Complete every LAUNCH_CHECKLIST.md gate; no automatic deployment |

Local work to prioritize next: enforce media signatures/storage quotas on the server, connect media to post drafts with ownership checks, add end-to-end browser tests with a mocked backend, and introduce a small provider contract around Gemini. Avoid empty placeholder connection/payment screens.

Do not implement or activate posting/payment flows from unverified client input. OAuth state, PKCE where supported, encrypted server-side credentials, narrow scopes, webhook signature checks, idempotency, and audited approval must be validated before those integrations are enabled.
