# Test report

Date: 12 October 2026. Runtime: Node 24. No real credentials, provider usage, Supabase requests, or user-data writes were required.

| Check | Last verified outcome |
| --- | --- |
| Baseline production build and lint | Passed |
| Expanded offline tests | 51 passed, including deletion confirmation, server uploads, reservation limits, post persistence, Arabic UI/RTL and Edge authentication |
| Strict Edge TypeScript | Passed for both handlers and entrypoints against installed SDK and minimal Deno contract; actual Deno runtime still unverified |
| Dependency audit | 0 vulnerabilities after source-map-js 1.2.2 and brace-expansion 5.0.12 patches |
| Updated media/localization build and lint | Passed on final checkpoint source, with no lint errors or warnings |
| Updated lockfile clean `npm ci` | Passed |
| Secret checks on final rebuilt assets | 2 passed |
| Browser workflow tests | 4 passed on headless Edge: English/Arabic × desktop/mobile, including responsive and keyboard-navigation checks |
| Browser test TypeScript | Passed after adding Node 24 types |
| GitHub Actions | Configured; not run remotely |

Coverage includes mocked auth/signup/recovery/logout, late callbacks, authenticated AI/CORS/validation/provider failure paths, quota rejection and verified-user charging, Arabic prompt preferences, approval edit/revert invalidation, draft saving, future-only scheduling, client media size/MIME/signature validation, private URL expiry and errors.

Server media tests cover MIME/signature forgery, actual and declared byte limits, stalled body timeout, verified-user capacity reservations, quota denial, cross-owner paths, storage failures, and reservation finalization. New SQL tests verify direct client uploads are denied and reservation caps cannot be bypassed. No actual customer files were uploaded or deleted.

PGlite runs the actual migration SQL against PostgreSQL with simulated Supabase `auth.uid()` and Storage schemas. Tests exercise two users, ownership changes, forged approval metadata, scheduling transitions, client attempts to mutate quotas, quota cap enforcement, anonymous access, and private storage folder isolation. These tests do not validate the hosted Supabase gateway, email delivery, Storage API byte enforcement, or real network concurrency.

Run: `npm ci`, `npm run lint`, `npm run check:edge`, `npm run build`, `npm test`, `npm audit`.

Browser tests: `npm run test:e2e`. Windows uses installed Microsoft Edge; Linux CI installs Playwright Chromium. The server listens on 127.0.0.1:4179 with placeholder Supabase values, and page requests outside localhost are blocked. Tests use isolated browser storage. All four passed after fixing accessible field names and the missing viewport metadata. Mobile checks verify the real responsive breakpoint, no horizontal overflow, drawer focus cycling, Escape dismissal and focus return. Screenshots were reviewed locally; this is not a full WCAG or native-speaker certification.

The final Node-type addition was installed successfully after the last clean-install check; the lockfile remains checked by CI. No dependency versions used by the app were otherwise changed beyond the two targeted vulnerability patches.

CI performs the local validation sequence without secrets or deployment. Live integration and browser/device testing remain required before release.
