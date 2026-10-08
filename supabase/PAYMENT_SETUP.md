# Payment setup and test-mode handoff

Status: 8 October 2026. The owner explicitly approved the complete database scope. The combined update and missing payment-event FK index were applied; live baseline and payment/session rollback suites passed. Both launch gates remain false. No new function deployment, merchant credential, checkout, charge, refund or website/social publication was performed.

## Reviewed database update

The concrete update is
`migrations/20261007071717_secure_connections_and_publish_queue.sql`, reviewed
and saved in GitHub with SHA-256
`4cd66f287b558404ddd999bb6db80b58b21f685e864a78bea75a340606e8557d`.

The applied database update covers:

- Session checks on post/media/usage access; storage/draft quotas and post revisions.
- Private encrypted social credentials, single-use OAuth state, account metadata,
  publication snapshots/leases and metrics tables.
- Payment orders, verified event/refund accounting and the credit ledger.

Both payment and publication controls default to **false**. The migration adds
no merchant keys, charge, public hosting, social post, worker schedule or Storage
DELETE grant. It changes access policies and write triggers. Role-based live rollback checks passed; actual client JWT/login/global-signout and concurrent-worker regression remain pending.
Reconcile the existing migration history before a CLI push; do not rerun the
old schema files. Recorded versions and repository paths are in `migration-history.json`.

## Merchant account

The owner answered that the Razorpay account status is unknown. Account access
has not been inspected. The next account step is to sign in or sign up at
[Razorpay Dashboard](https://dashboard.razorpay.com/), complete the provider's
verification flow personally, and select **Test Mode**.

Razorpay documents that Test Mode becomes available after signup and uses
simulated transactions. Its API-key guide permits generating test keys without
adding a website. Live account activation and website verification are later
provider requirements; website publishing remains subject to owner permission.

Use **Account & Settings → Website and app settings → API Keys** in Test Mode.
Do not regenerate an existing key until checking whether another integration
uses it. The secret is shown only when generated; transfer it through the
approved server secret-management flow, never through chat, GitHub, browser
frontend variables or screenshots. Login passwords and OTPs belong in the
provider's sign-in flow.

## Server configuration after approval

Use an isolated test database/environment for provider Test Mode. Razorpay
separates its test and live records; this application's credit ledger must also
be kept separate. Test credits must never buy production AI calls or persist
into a live customer balance.

The empty configuration reference is `server-env.example`. Setup requires:

| Setting | Purpose |
| --- | --- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Test-mode provider API access |
| `RAZORPAY_ACCOUNT_ID` | Exact expected `account_id` from the verified merchant event |
| `RAZORPAY_WEBHOOK_SECRET` | Independent random HMAC secret |
| `APP_URL` | Fixed HTTPS application root used for the return URL |
| `ALLOWED_ORIGINS` | Exact approved application origins |
| `BILLING_PLANS_JSON` | Owner-selected integer paise prices and AI-attempt credits |

No production prices have been chosen. Amounts in tests are synthetic fixtures.
The current implementation supports one-off INR credit purchases. Currency,
international-payment eligibility, product terms and refund policy need owner
and provider review before an international launch.

The database update is approved/applied and SQL rollback checks passed. Next, deploy
`payment-checkout` with gateway JWT verification enabled. Deploy
`payment-webhook` with gateway JWT verification disabled only because its
handler verifies the raw-body provider HMAC. Keep both billing controls off
until the isolated provider test environment is ready. Keep publication off.

For the current project the eventual webhook URL is:

`https://nkfecpdegcmsapvbviky.supabase.co/functions/v1/payment-webhook`

This endpoint has **not** been deployed. Do not register an active webhook yet.
The required events are `payment_link.paid` and `refund.processed`. Set the
same secret on the provider and server and configure an owner-approved alert
address. A browser return URL does not grant credits.

## Provider tests still required

Check successful/failed/cancelled checkout, captured amount/currency/merchant,
duplicate events, partial/full refunds, event ordering, network timeouts and
manual reconciliation. Confirm exactly one credit grant and each refund
reversal in the isolated database, then confirm no real funds or production
credits were touched. Only after this evidence is reviewed should the owner
approve live keys and collection. Never retry an uncertain checkout blindly.

Local handler tests intercept every Auth, database and provider request.
Local and live PostgreSQL rollback suites verify duplicate accounting and credit balances. These do not establish a live provider integration.

References: [Test and Live Modes](https://razorpay.com/docs/payments/dashboard/test-live-modes),
[API Keys](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/),
[Webhook Setup](https://razorpay.com/docs/payments/dashboard/account-settings/webhooks),
[Webhook Validation](https://razorpay.com/docs/webhooks/validate-test/),
[Supabase server secrets](https://supabase.com/docs/guides/functions/secrets).
