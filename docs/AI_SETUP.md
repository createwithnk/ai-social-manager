# AI compatibility setup

The confirmed AasiFlowAI project is nkfecpdegcmsapvbviky. This branch now reuses its existing has_active_session and consume_ai_quota RPCs. Both run under the caller session; the generator needs no service-role credential for quota or attachment reads.

The frontend sends English/Arabic/Hindi/Urdu language names for the current deployed function. The proposed handler also accepts en/ar/hi/ur aliases and Gulf market prompts. Market is prompt-only and is not a posts column. No new quota table/RPC is required; existing daily attempts and paid-credit accounting remain authoritative.

GEMINI_API_KEY and GEMINI_MODEL remain server-only. Existing public-key dictionary/legacy anon configuration is supported. Exact ALLOWED_ORIGINS, verified nonanonymous email users, revoked-session rejection, 8 KiB/10-second input reads, 25-second provider deadline and 128 KiB response limit are checked locally. Attachments are downloaded from post-media under the caller token, with 10 MiB/MIME/container checks. The provider cannot publish or approve posts; generation only returns editable content.

Run npm ci, npm run build, npm run lint, npm test, npm run check:edge, npm run check:deno and npm run test:edge. Deno 2.9.6 is pinned for the actual runtime checks; its offline fixture tests have no network permission.

The current hosted generator is a different version. Do not claim the new runtime is live. A deployment, real Gemini call or migration still needs separate owner approval. See BACKEND_COMPATIBILITY.md and LAUNCH_CHECKLIST.md before any release.
