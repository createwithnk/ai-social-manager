# Velo (formerly AasiFlowAI)

The display name is now Velo. Repository identity, Supabase target and existing storage/session keys are preserved. New [asset, publisher and lead modules](docs/VELO_MODULES.md) are isolated preparation tools; OAuth connections, automatic publishing and live WhatsApp messaging are not activated.

Human-in-the-loop social media content workspace. Turn an idea into a platform-specific draft, edit it, explicitly approve it, and place it on a content calendar.

## Current MVP

- Responsive dashboard and content metrics
- Authenticated server-side Gemini generation, with template drafts in unconfigured local preview mode
- Review, save, and resume drafts before approval
- Explicit approval gate before saving as approved; every edit clears approval
- Approved-content calendar with custom scheduling, rescheduling, and unscheduling
- Browser persistence for local MVP data
- No automatic publishing and no client-side API keys
- Arabic/English content, Gulf-market targeting, and Arabic interface with RTL support
- Existing private image/video/audio storage, attachments and expiring previews
- Revoked-session checks, revision-safe post updates, daily AI quota and existing Storage limits

See [project status](docs/PROJECT_STATUS.md) and [backend compatibility](docs/BACKEND_COMPATIBILITY.md). This branch reuses the confirmed existing backend; its code and one proposed scheduling guard have not been deployed/applied.

## Run locally

```bash
npm ci
npm run dev
```

## Supabase setup

Use the confirmed existing AasiFlowAI project `nkfecpdegcmsapvbviky`. Keep public URL/key configuration local and never copy server credentials into Vite. Review [migration history](supabase/migration-history.json) before any database operation: historical migration timestamps differ, and the initial posts schema already exists. Do not replay the migration directory against live. New migrations and deployments require separate owner approval.

When both Supabase variables are configured, users must sign up or log in before they can access the workspace. Their posts are stored behind Row Level Security, so each user can only access their own data. When the variables are not configured, the MVP continues to use browser local storage as a temporary fallback.

Never add a service-role key, a real `.env` file, or any other credentials to Git.

## Next milestone

Review the reconciled code and CI, then plan an owner-approved staged/runtime verification. See [AI setup](docs/AI_SETUP.md) and [security QA](docs/SECURITY_QA.md). Publishing and billing remain gated and require separate approval.
