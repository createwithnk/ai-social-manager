# Launch checklist — deployment requires owner approval

## Required gates

- [ ] Owner confirms the Supabase project reference. No account-generic project name is sufficient evidence.
- [ ] GitHub development commits are pushed and PR CI passes; owner approves any merge into main.
- [ ] Back up the confirmed database and verify restoration in an isolated environment before applying migrations.
- [ ] Review and apply migrations in timestamp order. Do not reset a live database. Test existing approved/scheduled posts and require fresh review where approval evidence is absent.
- [ ] Verify live two-user post/usage/media isolation, anonymous rejection, and Storage policies.
- [ ] Confirm email delivery, verification, recovery redirects, password policy, secure logout and expired sessions.
- [ ] Verify Deno entrypoints, JWT gateway configuration, exact allowed frontend origins, real Gemini response format and model access.
- [ ] Confirm server-only Gemini/service-role keys, no secret logging, quotas and provider-spend safeguards. Never place server keys in VITE variables.
- [ ] Add server-side media signature validation/quarantine, storage quotas and abuse controls before public uploads.
- [ ] Complete Arabic interface/accessibility/mobile browser verification.
- [ ] Verify media privacy, expired previews, deletion confirmation and any draft attachment ownership.
- [ ] Review privacy/retention/customer support requirements with the business owner; do not infer legal compliance from code.
- [ ] Establish monitoring for failure rates, timeouts, quota denials and storage growth without logging ideas, content, credentials, signed URLs or personal information.
- [ ] Define incident response, key rotation and restore procedures; rehearse them with test infrastructure.
- [ ] Estimate costs from chosen plans and measured requests before launch: Gemini tokens/attempt × attempts, Supabase database/storage/egress, and official platform API charges if any. No paid resources are activated by this code.
- [ ] Owner explicitly approves deployment/public exposure. Social publication and live billing require separate approval.

## Future integrations

Official social OAuth needs provider-owned app credentials, approved redirect URLs, narrow scopes, CSRF state, encrypted server token storage, revocation and provider review. Keep publishing disabled until authorized, with a worker enforcing current audited approval and idempotency.

Billing needs a selected provider and test account, verified webhook signatures, idempotent event storage, server-controlled entitlements and reconciliation. Prices/plan limits and merchant requirements need owner decisions. Live charges and identity documents remain prohibited without approval.

## Proposed release sequence

Use an isolated test project first. Review configuration and backups, apply migrations, validate runtime and RLS, then deploy matching function/frontend only after approval. Document rollback; prefer reverting code and forward fixes over dropping tables or deleting customer data. Confirm log redaction and spend limits before opening registration publicly.
