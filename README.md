# AasiFlowAI

Review-first social content workspace. This branch prepares account-backed content generation and media workflows. **Database/private storage setup is live; no website, AI function, publisher or payment collector has been deployed.**

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
2. Set only `VITE_SUPABASE_URL` (project root, no `/rest/v1`) and the public anon key in an untracked local `.env` using `.env.example`.
3. Set **server-side** secrets: `GEMINI_API_KEY`, `GEMINI_MODEL` (a currently available multimodal Gemini model), and `ALLOWED_ORIGINS` (comma-separated exact origins; include the local development origin when testing). Supabase provides its URL/anon key in the function environment. Never use VITE-prefixed provider secrets.
4. Deploy the `generate-content` Edge Function only when deployment is authorized. It validates the bearer token with Supabase Auth; it never uses a service-role key. Configure gateway JWT verification for the project's supported key mode; application-level token validation must remain enabled.
5. Confirm email signup/login; test an actual generated caption, reload a saved post, and reopen an uploaded media preview.
6. Test isolation with two users: one must not read another's posts/media, attach another user's path, or use AI without authentication. Test 21 concurrent generation attempts: only 20 may consume quota. Database ownership and sequential quota checks passed; signed-in HTTP and concurrent request checks are still pending.
7. Set provider-side spend limits/alerts before using paid generation. No payment details are stored in this repository.

## Boundaries and remaining work

- Instagram/LinkedIn OAuth, token lifecycle, official publishing APIs, background dispatch, webhooks, and real analytics are **not implemented**. They need a separately authorized integration phase and platform app configuration/review.
- X/Facebook are drafting destinations only. No social API calls are made.
- Billing/subscriptions, credit purchases and production hosting are not configured.
- Database and private bucket setup are live and database policies were tested. AI deployment, signed-in uploads/previews and actual generation still need end-to-end checks.
- Each draft has one attachment. Replace/remove detaches the file; old uploads are retained privately (no delete policy yet, to avoid breaking shared draft references). Add a retention/cleanup job before opening public signup.
- Preview URLs expire after one hour; reopen the post to refresh. Recording depends on HTTPS/localhost and microphone support. Large videos need a future resumable upload pipeline.
- AI can be wrong: users must review claims and content. Platform-specific URL weighting and publishing validations belong in the future platform adapters.
- The database resets modified approved content to draft. It cannot prove that a human actually reviewed content; the approval UI records the user's deliberate action.

Official API references: https://ai.google.dev/api/generate-content and https://supabase.com/docs/guides/functions/auth.

## Live verification — 6 October 2026

The existing project was resumed on its Free plan. Applied live migration `20261006090620_content_system_private_media_and_quota`: media/language fields, private 10 MB storage, ownership constraints, approval reset trigger, and a private privileged quota routine behind an unprivileged RPC wrapper. Anonymous table grants and client TRUNCATE/REFERENCES/TRIGGER privileges were removed. The existing post remains intact.

`tests/live-database.sql` passed against the actual database: synthetic users verified post save/update, scheduled-content edit resets, past-schedule rejection, cross-user read/write and attachment denial, storage folder policies, usage isolation, a 20-attempt limit, quota tamper denial and anonymous access denial. All synthetic users, posts, storage rows and quota data were rolled back; subsequent checks found no test users or storage rows. Storage tests cover database access policies, not file bytes uploaded through Storage HTTP. Concurrency was not stress-tested.

Database performance advisors returned no notices. The remaining security advisory concerns disabled leaked-password protection; review https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection before public signup. No Auth settings or billing plan were changed.

The initial posts schema was created before migration tracking; its legacy migration is not recorded remotely. The applied live migration version differs from the prepared repository file name. Reconcile/pull migration history before any future CLI db push; do not blindly reapply either file to this project.

Remaining end-to-end checks need a signed-in app session: email confirmation/login, upload/download/signed previews, and real Gemini generation. Gemini secrets/model/origins are not set through the connected plugin, which has no secret-management operation. No provider billing or paid request has been performed.

HTTP reachability checks: Auth settings returned 200 (email signup enabled, email confirmation required); Storage bucket list returned 200 with zero anonymous-visible buckets. Anonymous posts HTTP request hit a network error, so REST reachability is not asserted from that check. SQL privilege/ownership tests passed independently. Google AI Studio redirected to a Google sign-in page; its API keys/billing are not accessible until secure sign-in succeeds.
