# Security QA for the reconciled backend

No deployment or live mutation is authorized. Project identity is confirmed; version compatibility is separately verified locally. See BACKEND_COMPATIBILITY.md.

- Retain the existing session-aware post/usage/Storage RLS and private security-definer functions with pinned search paths and narrow grants.
- Keep immutable ownership, revision compare-and-swap, approval invalidation, queued-job cancellation, processing locks and provider replay/lease protections.
- Use consume_ai_quota with the verified caller token, never a body-supplied user ID or a duplicate service-only RPC. Clients cannot reset ai_usage or credit balances.
- Keep Gemini/provider/server credentials out of Vite, repositories and logs. Never log signed previews or user content.
- Validate exact CORS, MIME/byte bounds, revoked sessions, provider failures/timeouts and platform character limits.
- Use private post-media, no upsert, 10 MiB media, owner/session restrictions and existing object caps. No client deletion policy exists; do not claim successful deletion or bypass it.
- Treat generation, approval, calendar planning and actual publication as distinct actions. Publishing and billing require environment AND database gates, plus separate owner approval.
- Keep existing social/payment source unchanged except loader-compatible shared error syntax. Test OAuth state, encryption binding, replay, immutable prices, merchant identity and webhook signatures with fixtures only.

Local Node/PGlite/Deno/browser results are in TEST_REPORT.md. Real Auth/email/Storage enforcement, live new-function behavior, distributed concurrency and hosted-log checks remain pending. Scanning/quarantine and owner-authorized retention are separate pre-launch work.
