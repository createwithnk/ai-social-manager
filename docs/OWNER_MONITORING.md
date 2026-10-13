# Owner monitoring checkpoint — 13 October 2026

Current continuation: prepared trusted numeric generator outcomes/tokens, estimated USD at configured rates, conservative committed/carryover budgets and bounded untrusted client-error counters. The dashboard displays these only when the approved Beta-safety RPC exists, with Arabic/RTL/mobile support. Server-only completion credentials are confined to the fixed numeric RPC; no customer secrets/content are returned or collected. Billing/subscriptions and measured invoices remain unavailable. See PRIVATE_BETA_RELEASE_REVIEW.md for exact pending SQL and acceptance. The original checkpoint below remains historical.

The mobile-friendly dashboard is read-only and returns aggregate user, draft, approval and UTC daily AI quota-attempt counts. It warns if either database launch gate is open. Quota attempts include failed provider requests; they cannot measure cost. Measured provider cost, subscriptions and runtime error counts are explicitly unavailable. No customer rows, email addresses, prompts, uploads, tokens or credentials are returned. Automated log collection and total-project spend enforcement remain unfinished.

Authorization uses a private, RLS-enabled membership table, not email matching or editable JWT user metadata. Only a database operator may assign membership after explicit owner approval. Every RPC call checks both membership and the existing active-session guard. The public RPC is security invoker; its private definer has an empty search path and fixed queries. No service-role client or broad customer-table policy is added. Navigation is discoverable to signed-in users; unauthorized callers receive no metrics. Responses are never persisted in browser storage. Refresh clears old metrics; requests time out after ten seconds and errors suppress database details.

## Pending database review and approval

Do not run a blanket database push. Preserve canonical migration history. Review `20261014000000_owner_monitoring.sql` alongside the separately pending prior-approval trigger. The monitoring migration creates only private.owner_admins and two RPC functions. After approved application, separately approve assigning the exact owner Auth user UUID using an operator query with a bound parameter. No owner identity is guessed or assigned by this checkpoint. Revoking membership removes access on the next request; existing rendered aggregates disappear on refresh/navigation/signout. Rollback drops the public RPC first, then private RPC and private membership table, without changing customer data or existing protections.

## Acceptance still required

Local fixtures test membership removal, revoked sessions, anonymous/ordinary users, self-grant denial, exact output keys and malformed/error UI handling. Browser checks exercise access denial at desktop/mobile widths. Authorized owner success over the hosted gateway, response headers, observed provider spend and redacted operational logs require separate release acceptance. No live Supabase inspection or mutation was performed in this checkpoint.

The free UAE Beta still needs invite-only hosted Auth configuration, a chosen host/origin/cohort, Arabic/accessibility acceptance, a media safety decision, support/privacy/retention arrangements, and approved provider usage limits. Publishing and billing remain outside scope.
