# Optional Turnstile activation

The client integration is prepared and locally tested. **Hosted Supabase CAPTCHA is not enabled by this code or its tests.** The existing development configuration leaves `VITE_TURNSTILE_SITE_KEY` empty; it loads no Cloudflare script. A frontend-only widget cannot protect direct Auth requests. Supabase must verify the matching provider secret on its server before this is described as bot protection.

## Configure an isolated test environment first

1. Create a Cloudflare Turnstile widget for the intended test hostname. Select the Free plan if available for the chosen account; do not approve a paid plan or enter billing information. Keep pre-clearance disabled; the app only uses Auth challenge tokens.
2. Put the widget's **public site key** in the frontend's untracked environment as `VITE_TURNSTILE_SITE_KEY`. Never put the widget secret, a Supabase service-role key or provider credentials in any `VITE_` value, source file, commit, screenshot or chat message.
3. In the matching Supabase project's Authentication / Bot and Abuse Protection settings, select Turnstile and enter the corresponding **secret key** through the provider's secret field. Record which environment/hostname was configured without recording the secret. Do not turn on the hosted setting while an existing client still lacks the matching public site key: sign-in/signup/email flows could stop working.
4. Rebuild the frontend. The header generator allows only `https://challenges.cloudflare.com` in `script-src` and `frame-src` when a valid site key is configured. It keeps inline/eval scripts blocked and does not broaden `connect-src`. The eventual host must apply these generated headers; building does not publish or configure hosting.
5. Verify with an isolated disposable account: login, signup, reset and resend should send a challenge proof; missing, invalid, expired and already-used proofs should be denied by **actual Supabase HTTP**, not just the UI. Check direct API requests without the widget. Confirm credentials and email links are never written to reports. Complete the final allowlisted HTTPS-domain and real-email checks separately.
6. Check a fresh challenge after a failed attempt, action/language changes and expiration, plus recovery after a blocked/slow script. The app clears stale proof, disables submission until reverified, offers explicit retry, bounds initial readiness to 15 seconds and removes a failed script's cached API. Compact widgets fit the 360px Arabic/English account card.

For isolated localhost development, Cloudflare's reserved dummy site key `1x00000000000000000000AA` may be used **only with a matching test backend secret/environment**. This repository's browser tests intercept the widget and Auth locally instead. Production builds reject reserved dummy keys even when served on localhost; public hosts also reject them at runtime. A syntactically valid public site key still requires a real widget and matching server setup.

Login/signup errors remain generic. Email actions retain their existing account-enumeration-safe notices, PKCE redirects, password minimum and one-minute UI cooldown. The cooldown is client convenience, not an Auth-server rate limit. Password recovery's authenticated `updateUser` step and global logout are unchanged. Existing Supabase rate limits remain in effect; no live rate setting was altered.

## Scope of the 9 October tests

`tests/captcha.test.ts` and `tests/header-policy.test.mjs` check configuration/proof validation and restrictive production policies. `tests/browser-captcha.cjs` exercises the actual UI and SDK request bodies with intercepted Auth and a local widget double: proof required on all four Auth actions, consumption after a failed attempt, expired/error/timeout proof, stale callbacks, action/language changes, script failure/readiness timeout/retry, minimum password, fixed PKCE redirects and email cooldown. English/Arabic mobile/desktop layouts are checked; the challenge shown in QA screenshots is a local fixture, not Cloudflare's actual iframe.

These results do not establish Cloudflare verification, hosted server enforcement, real email delivery, final host CSP, resistance to every bot or an account's eligibility. No real account, secret, paid upgrade, email, payment or deployment was created by these tests.

Primary references: [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Cloudflare explicit rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/), [testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), [plans](https://developers.cloudflare.com/turnstile/plans/).
