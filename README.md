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
