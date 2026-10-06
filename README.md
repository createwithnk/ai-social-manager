# AasiFlowAI

Review-first social content workspace. **The database, private storage and authenticated AI backend are live in the connected Supabase project. The website, social publisher and payment collector have not been published.**

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

## Account setup reference

1. For a new project only, apply the original posts migration, then `supabase/migrations/20261003000000_content_system.sql`. This setup is already applied to the connected project; see the live verification section before using the CLI.
2. Set only `VITE_SUPABASE_URL` (project root, no `/rest/v1`) and the public publishable/anon key in an untracked local `.env` using `.env.example`.
3. Set **server-side** secrets: `GEMINI_API_KEY`, `GEMINI_MODEL` (a currently available multimodal Gemini model), and `ALLOWED_ORIGINS` (comma-separated exact origins; include the local development origin when testing). The function uses Supabase's built-in `SUPABASE_PUBLISHABLE_KEYS.default`, with `SUPABASE_ANON_KEY` as a fallback. Never use VITE-prefixed provider secrets.
4. Deploy the `generate-content` Edge Function only when deployment is authorized. Keep gateway JWT verification enabled and validate the bearer token with `auth.getUser`; no service-role key is used. The connected project is already deployed and verified with both checks enabled.
5. Confirm real-user email signup/confirmation before launch. Confirmed synthetic accounts have passed password login, actual AI generation, saved-post reload and uploaded-media preview checks.
6. Test isolation with two users: one must not read another's posts/media, attach another user's path, or use AI without authentication. Send 21 concurrent quota RPC requests: exactly 20 should succeed, followed by an AI request rejected for exhausted app quota. These HTTP checks passed on the connected project without making 21 provider calls.
7. Set provider-side spend limits/alerts before using paid generation. No payment details are stored in this repository.

## Boundaries and remaining work

- Instagram/LinkedIn OAuth, token lifecycle, official publishing APIs, background dispatch, webhooks, and real analytics are **not implemented**. They need a separately authorized integration phase and platform app configuration/review.
- X/Facebook are drafting destinations only. No social API calls are made.
- Billing/subscriptions, credit purchases and production hosting are not configured.
- Database, private bucket and authenticated AI setup are live. Signed-in HTTP upload/download/previews, draft save/reload, actual text/image AI generation and concurrent quota checks passed. Real-user email confirmation delivery, actual microphone capture and live video/audio generation remain unverified.
- Each draft has one attachment. Replace/remove detaches the file; old uploads are retained privately (no delete policy yet, to avoid breaking shared draft references). Add a retention/cleanup job before opening public signup.
- Preview URLs expire after one hour; reopen the post to refresh. Recording depends on HTTPS/localhost and microphone support. Large videos need a future resumable upload pipeline.
- AI can be wrong: users must review claims and content. Platform-specific URL weighting and publishing validations belong in the future platform adapters.
- The database resets modified approved content to draft. It cannot prove that a human actually reviewed content; the approval UI records the user's deliberate action.

Official API references: https://ai.google.dev/api/generate-content and https://supabase.com/docs/guides/functions/auth.

## Live verification — 6 October 2026

The existing project was resumed on its Free plan. Applied live migration `20261006090620_content_system_private_media_and_quota`: media/language fields, private 10 MB storage, ownership constraints, approval reset trigger, and a private privileged quota routine behind an unprivileged RPC wrapper. Anonymous table grants and client TRUNCATE/REFERENCES/TRIGGER privileges were removed. The existing user and post remain intact; counts were 1 before and after testing.

`tests/live-database.sql` passed against the actual database: synthetic users verified post save/update, scheduled-content edit resets, past-schedule rejection, cross-user read/write and attachment denial, storage folder policies, usage isolation, a 20-attempt limit, quota tamper denial and anonymous access denial. This SQL transaction rolled back all its fixtures.

The Supabase Dashboard is authenticated. Its existing `GEMINI_API_KEY` was used without revealing or copying it. Added `GEMINI_MODEL=gemini-3.5-flash-lite` and `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`. Deployed `generate-content` with `verify_jwt=true`; the pinned Supabase client version is `2.112.4`.

Two isolated confirmed Auth fixtures passed password login. `tests/live-http.py --allow-ai` then passed 22 HTTP checks: authenticated identity; unauthenticated/origin/invalid-brief/foreign-attachment rejection; real Hindi JSON output within the X character limit; private PNG upload/download; signed preview creation and reopening; cross-user media/preview denial; draft-with-attachment save/reload; cross-user post read/write denial; exactly 20 successful quota consumptions out of 21 concurrent requests; exhausted-quota AI rejection; and per-user quota visibility. Text-only and image-assisted Gemini calls both returned 200; only two provider calls were made. Results are recorded in `tests/verification-2026-10-06.json`.

The test post, both synthetic Auth users and their quota rows were removed, and temporary credential/session files were deleted. The 69-byte PNG was permanently deleted through the Dashboard after explicit user approval; database verification found zero matching test images. The Dashboard retains a zero-byte empty-folder placeholder. No new Storage DELETE policy was added. Confirmed fixture login does not test outbound signup/confirmation email delivery. Browser regression covers the local demo with mocked cloud APIs; it does not establish a full signed-in browser journey.

Database performance advisors returned no notices. The remaining security advisory concerns disabled leaked-password protection; review https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection before public signup. No Auth settings or billing plan were changed.

The initial posts schema was created before migration tracking; its legacy migration is not recorded remotely. The applied live migration version differs from the prepared repository file name. Reconcile/pull migration history before any future CLI db push; do not blindly reapply either file to this project.

Auth settings returned 200: email signup is enabled and email confirmation is required. No Auth settings were changed. Actual app generation succeeded without adding billing: no billing account was linked, credits bought, paid plan enabled or payment method saved. The separate AI Studio Playground attempt had returned an internal error; the cause was not established, and the successful app API calls supersede it for backend verification.
