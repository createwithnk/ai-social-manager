Verification run in the implementation workspace:

- Frontend TypeScript + Vite production build: passed.
- ESLint: passed.
- Six workflow validation tests: passed (empty captions, platform limits including hashtags, missing/invalid/past schedules, draft schedule clearing, valid future planning).
- Browser regression: passed on a 390 × 844 mobile viewport using Chromium. Covered persistence after reload, content-change approval reset, approved/scheduled read-only editing, past-date rejection, future scheduling, schedule clearing on edit, no horizontal overflow and no runtime exceptions.
- Mocked Edge Function tests: passed authentication, origin, brief validation, cross-user attachment rejection, request size, daily quota rejection and provider success. Run `node tests/endpoint.cjs`.

Live HTTP verification (2026-10-06): two disposable confirmed accounts passed password login. `live-http.py --allow-ai` passed 22 authenticated HTTP checks covering actual text/image Gemini calls, private file upload/download/signed previews, saved-post reload, per-user isolation and 21 concurrent quota requests allowing exactly 20. Both Gemini calls returned 200. See `verification-2026-10-06.json`.

For an explicitly authorized live run, provide two isolated confirmed `@example.invalid` accounts in a private credentials JSON as described in the script, then run:

```bash
python3 tests/live-http.py --credentials /absolute/private/fixtures.json --report /absolute/private/results.json --allow-ai
```

Omit `--allow-ai` to avoid provider calls. The script uses the local untracked `.env` and requires an already configured project/function. Never commit credentials, sessions or signed URLs. It deletes its test post, retains its tiny private media fixture, and leaves Auth fixture cleanup to the administrator. With `--allow-ai`, non-200 text or image generation makes the script fail even if core storage/quota checks pass.

Both temporary Auth accounts and quota rows were removed after this run; the existing user and post counts remained at 1. A 69-byte private PNG is retained pending authorized administrator cleanup. No Storage DELETE permission was added.

Not run: real-user signup/confirmation email delivery, actual microphone device capture, live video/audio Gemini requests, platform OAuth/publishing or payments. The browser regression intentionally exercises the local demo with mocked cloud APIs and does not claim a full signed-in browser journey.

Live database verification (2026-10-06): `live-database.sql` passed in a rollback transaction on the connected project. It verifies post CRUD/ownership, approval reset, schedules, storage metadata access policies and quota. This transaction left no fixtures. HTTP checks above separately verify file bytes, provider responses and concurrency.
