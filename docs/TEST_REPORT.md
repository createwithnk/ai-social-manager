# Test report

Date: 12 October 2026. Runtime: Node 24. No real credentials, provider usage, Supabase requests, or user-data writes were required.

| Check | Last verified outcome |
| --- | --- |
| Baseline production build and lint | Passed |
| Expanded offline tests | 44 passed, including post persistence, Arabic UI/RTL and actual Edge adapter authentication |
| Strict portable Edge handler TypeScript | Passed after quota/language integration |
| Dependency audit | 0 vulnerabilities after source-map-js 1.2.2 and brace-expansion 5.0.12 patches |
| Updated media/localization build and lint | Passed on final checkpoint source, with no lint errors or warnings |
| Updated lockfile clean `npm ci` | Passed |
| Secret checks on final rebuilt assets | 2 passed |
| GitHub Actions | Configured; not run remotely |

Coverage includes mocked auth/signup/recovery/logout, late callbacks, authenticated AI/CORS/validation/provider failure paths, quota rejection and verified-user charging, Arabic prompt preferences, approval edit/revert invalidation, draft saving, future-only scheduling, client media size/MIME/signature validation, private URL expiry and errors.

PGlite runs the actual migration SQL against PostgreSQL with simulated Supabase `auth.uid()` and Storage schemas. Tests exercise two users, ownership changes, forged approval metadata, scheduling transitions, client attempts to mutate quotas, quota cap enforcement, anonymous access, and private storage folder isolation. These tests do not validate the hosted Supabase gateway, email delivery, Storage API byte enforcement, or real network concurrency.

Run: `npm ci`, `npm run lint`, `npm run check:edge`, `npm run build`, `npm test`, `npm audit`.

CI performs the local validation sequence without secrets or deployment. Live integration and browser/device testing remain required before release.
