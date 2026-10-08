# Security and QA checklist

This branch contains proposed hardening changes. It is not approved for production deployment.

## Before merge
- Run `npm ci`, `npm run lint`, and `npm run build` in a clean environment.
- Test signup and login with email confirmation enabled and verify password policy in Supabase Auth settings.
- Verify each user can read/write only their own posts. Confirm SQL grants and RLS are applied to the live project.
- Test draft edits invalidate approval when caption, hashtags, idea, tone, or platform changes.
- Test editing scheduled content resets status to draft and clears scheduled time.
- Test scheduling rejects past times and accepts future times.
- Test missing/expired sessions and network failures.
- Confirm no service-role or AI provider secret is present in Vite variables or tracked files.
- Review browser localStorage fallback: it is for local MVP only and is not a substitute for authenticated storage.
- Add automated tests for these invariants before merging.

## Deployment restrictions
- No public deployment, live billing, payment document submission, or social publishing without explicit owner approval.
- Do not bypass RLS, weaken password requirements, or use unofficial social APIs.
