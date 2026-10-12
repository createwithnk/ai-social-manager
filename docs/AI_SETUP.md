# AI Generator setup (not deployed)

The React app invokes the Supabase Edge Function `generate-content` when signed in. The function validates the user's session, calls Gemini server-side, and returns an editable caption and hashtags. Nothing publishes automatically.

## Required server configuration
- `GEMINI_API_KEY`: Google AI Studio key. Store only as a Supabase Edge Function secret. Never put it in `VITE_*`, GitHub, or browser code.
- `ALLOWED_ORIGINS`: comma-separated exact development and production frontend origins, for example `http://localhost:5173`. Set only trusted origins. This is a browser CORS allowlist, not a substitute for authentication.
- `GEMINI_MODEL`: optional; defaults to `gemini-2.5-flash`.
- Supabase's built-in `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) must be available to the function.
- Keep JWT verification enabled for the Edge Function.

## Before enabling
1. Verify the intended Supabase project ID matches the frontend `VITE_SUPABASE_URL`. Do not use an unrelated project.
2. Configure the secrets and allowed frontend origins on the correct project.
3. Deploy only after the user explicitly approves deployment.
4. Test browser OPTIONS preflight, authenticated POST, expired JWT, malformed JSON, provider errors, and valid caption/hashtags.
5. Verify Gemini usage limits and cost before allowing public traffic; add per-user rate limits and quotas before launch.
6. Keep manual approval before saving as approved, scheduling, or any future publishing.

Current status: code committed on the security hardening branch; not deployed or end-to-end tested.
