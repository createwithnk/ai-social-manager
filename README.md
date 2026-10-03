# AasiFlowAI

Review-first social content workspace. This branch prepares account-backed content generation and media workflows. **Nothing has been deployed. There is no live publisher, connected social account, or payment collector.**

## Implemented

- Responsive dashboard, read-only details, draft editing and planning calendar.
- Supabase email authentication and per-user database access; local browser demo without configuration.
- Explicit AI action through an authenticated server endpoint, with English, Hindi, Urdu and Arabic briefs.
- Separate, clearly labelled English local templates (no AI call).
- Image, video and audio uploads to a private bucket, signed previews, and browser voice recording (60 seconds maximum).
- Media and voice attachments included in the Gemini request only when Generate with AI is selected.
- Editable captions/hashtags; any brief, attachment, language or content change clears the approval checkbox.
- Editing an approved/scheduled post first saves a draft and removes its schedule.
- Future-date and caption-length checks; calendar entries are plans, never automatic publishing jobs.
- Atomic limit of 20 AI attempts per user per UTC day, including failed attempts. This is an abuse limit, not a prepaid credit balance or guaranteed spending cap.
- Honest connection/setup status; no fabricated engagement metrics or best-time predictions.

## Local development

Node 24 recommended:

```bash
npm ci
npm run dev
npm run build
npm run lint
node --experimental-strip-types tests/workflow.test.ts
```

No environment variables are required for the local template demo. Local drafts remain only in the current browser. Attachments and AI require an account-backed setup.

Optional browser regression test: install Playwright in your development environment, install its Chromium browser, start Vite on port 5173, then run `node tests/browser.cjs`. No real credentials or paid API calls are used by that test.

## Later account setup — not performed in this work

1. Apply the original posts migration if absent, then `supabase/migrations/20261003000000_content_system.sql`. Back up live data first. Existing legacy rows are tolerated by the new constraints; new writes must comply.
2. Set only `VITE_SUPABASE_URL` (project root, no `/rest/v1`) and the public anon key in an untracked local `.env` using `.env.example`.
3. Set **server-side** secrets: `GEMINI_API_KEY`, `GEMINI_MODEL` (a currently available multimodal Gemini model), and `ALLOWED_ORIGINS` (comma-separated exact origins; include the local development origin when testing). Supabase provides its URL/anon key in the function environment. Never use VITE-prefixed provider secrets.
4. Deploy the `generate-content` Edge Function only when deployment is authorized. It validates the bearer token with Supabase Auth; it never uses a service-role key. Configure gateway JWT verification for the project's supported key mode; application-level token validation must remain enabled.
5. Confirm email signup/login; test an actual generated caption, reload a saved post, and reopen an uploaded media preview.
6. Test isolation with two users: one must not read another's posts/media, attach another user's path, or use AI without authentication. Test 21 concurrent generation attempts: only 20 may consume quota. These integration checks require a configured test project and have not been performed here.
7. Set provider-side spend limits/alerts before using paid generation. No payment details are stored in this repository.

## Boundaries and remaining work

- Instagram/LinkedIn OAuth, token lifecycle, official publishing APIs, background dispatch, webhooks, and real analytics are **not implemented**. They need a separately authorized integration phase and platform app configuration/review.
- X/Facebook are drafting destinations only. No social API calls are made.
- Billing/subscriptions, credit purchases and production hosting are not configured.
- AI, database migration and private storage are implemented in source but need deployment and live integration testing. A successful frontend build does not prove those services work.
- Each draft has one attachment. Replace/remove detaches the file; old uploads are retained privately (no delete policy yet, to avoid breaking shared draft references). Add a retention/cleanup job before opening public signup.
- Preview URLs expire after one hour; reopen the post to refresh. Recording depends on HTTPS/localhost and microphone support. Large videos need a future resumable upload pipeline.
- AI can be wrong: users must review claims and content. Platform-specific URL weighting and publishing validations belong in the future platform adapters.
- The database resets modified approved content to draft. It cannot prove that a human actually reviewed content; the approval UI records the user's deliberate action.

Official API references: https://ai.google.dev/api/generate-content and https://supabase.com/docs/guides/functions/auth.
