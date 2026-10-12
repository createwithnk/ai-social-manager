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

## Offline verification

Run `npm ci`, `npm run build`, `npm run lint`, `npm test`, and `npm run check:edge`.
The Node tests exercise the real request handler with mocked Supabase authentication and Gemini responses. Frontend tests execute the AI client and composer event handlers with in-memory React hooks. No credentials, database writes, deployments, or provider usage are needed. These checks do not replace a browser test against the confirmed project.

The function uses a structured response schema, validates completed output, and returns only an editable caption and hashtags. Gemini keys are sent only in the server-side provider header. Authentication has a 10-second network deadline; generation has a 25-second deadline covering response-body reading. CORS uses exact trusted origins, never a wildcard. The body is capped at 8 KiB and the brief at 500 characters.

The Deno entrypoint pins Supabase JS to the frontend's current version. `check:edge` type-checks the portable handler; the Deno entrypoint and Supabase gateway still require runtime validation before deployment.

Structured response fields follow Google's [Generate Content structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en).

Current status: no deployment or live end-to-end verification was performed during this development pass.
