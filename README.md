# AasiFlowAI

Human-in-the-loop social media content workspace. Turn an idea into a platform-specific draft, edit it, explicitly approve it, and place it on a content calendar.

## Current MVP

- Responsive dashboard and content metrics
- Platform and tone-aware local draft generation
- Review, save, and resume drafts before approval
- Explicit approval gate before saving
- Approved-content calendar with custom scheduling, rescheduling, and unscheduling
- Browser persistence for local MVP data
- No automatic publishing and no client-side API keys

## Run locally

```bash
npm install
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Apply [the posts migration](supabase/migrations/20260901000000_create_posts.sql) in the Supabase SQL editor or with the Supabase CLI.
3. Copy `.env.example` to a local `.env` file and replace its placeholders with the project's URL and **anon** key.
4. Restart the development server.

When both Supabase variables are configured, users must sign up or log in before they can access the workspace. Their posts are stored behind Row Level Security, so each user can only access their own data. When the variables are not configured, the MVP continues to use browser local storage as a temporary fallback.

Never add a service-role key, a real `.env` file, or any other credentials to Git.

## Next milestone

Add media storage and a secure server-side AI endpoint while preserving the approval gate. Publishing remains intentionally out of scope.

## AI generation and private attachments

The connected workspace now calls the `generate-content` Supabase Edge Function.
Only the disconnected demo uses templates; provider errors never silently fall
back to templates. Every brief, platform, tone, caption, hashtag or attachment
edit clears the review checkbox. Saving a draft does not require approval.
The calendar stores reminders only; it does **not** publish to social accounts.

Before deploying this frontend:

1. Apply the new migrations to the existing Supabase project in order. Do not
   recreate the existing posts table. They add explicit post privileges, an
   atomic 20-request-per-user UTC daily generation quota and private media storage.
2. Configure Edge Function secrets: `GEMINI_API_KEY`, `GEMINI_MODEL` (a model ID
   enabled on your Google project), and `ALLOWED_ORIGINS` (comma-separated exact
   frontend origins, including any explicitly permitted development origin).
   Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Edge Functions.
   Never prefix the Gemini key with `VITE_` or commit it to the repository.
3. Deploy `supabase/functions/generate-content`. Keep the platform JWT check
   enabled. The handler also validates the user's session against Auth.
4. Build/deploy the frontend with its existing public Supabase URL and anon key.
5. With a real account, generate a draft, upload an image and a video, save,
   reload and reopen each attachment. Confirm a second account cannot read
   another user's posts or attachments. Verify rejected/expired sessions and
   the daily quota before opening signup broadly.

The private `post-media` bucket permits JPG, PNG, WebP and MP4, up to 25 MB.
Preview URLs expire after five minutes and are refreshed while the preview is
open. Removing an attachment unlinks it from the draft; uploaded objects are
retained to avoid deleting media still referenced by a saved post. Add orphan
cleanup before scaling. Media is attached to posts, not analyzed by Gemini yet.
Generation attempts consume quota even if the upstream provider later fails.
Per-user quota does not replace provider billing limits or signup abuse controls.

## Verification and remaining integrations

Run `npm run build`, `npm run lint`, and `node tests/generation.test.mjs`.
The generation tests mock Auth, quota and Gemini; they are not a live provider
or database test. Database migrations and storage policies require a linked
Supabase environment for integration verification.

Instagram/LinkedIn OAuth, approval-bound publishing jobs, retry/idempotency,
voice/media understanding, posting-time recommendations and analytics are not
implemented by this change. These require platform app setup, appropriate
permissions and real account testing. No publishing job runs from this code.
