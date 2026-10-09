# UAE/Arabic launch and individual merchant handoff

Reviewed: 9 October 2026. The owner selected **personal / freelancer**. Merchant country, existing PayPal/Razorpay account status and provider approval remain unverified. No account association, payment document, live key, charge or paid upgrade was used. Both launch gates remain closed; the publication worker is undeployed and unscheduled.

## What exists

The English/Arabic interface supports RTL, local language preference and the device's timezone. Interface language is separate from the saved content language and provider payload values. Prices retain their actual **INR** denomination. No exchange rate or AED price is invented.

The prepared payment implementation creates one-off Razorpay **Payment Links** in INR and credits an account only after a verified captured event. It has no PayPal checkout, subscription or automatic refund initiation. Local intercepted handlers and database accounting checks have passed; merchant test transactions have not.

## Provider findings

| Finding from current primary documentation | Consequence for this project |
| --- | --- |
| Razorpay's India international guide directs individuals/freelancers to PayPal and also lists international bank transfer | Business-type eligibility must be checked for the actual owner account. A general currency list does not prove eligibility. |
| Razorpay documents PayPal with Standard Checkout; its conversion feature is limited to that integration | Our existing hosted Payment Links flow cannot be presented as a tested international PayPal checkout. |
| Razorpay documents PayPal linking in Live Dashboard, with account verification/authorization | Linking is held for the owner's account/document approval. Do not enable collection merely to explore this setting. |
| PayPal's supported currency list includes USD and omits AED, SAR and INR | Direct PayPal checkout must use a verified supported currency. Arabic UI does not imply AED checkout. |

Razorpay's PayPal page describes INR conversion but its FAQ says PayPal appears for non-INR purchasing currencies. Treat this as requiring provider confirmation and an isolated integration test, rather than relying on an assumption about INR checkout. Actual eligibility, payment availability, fees and settlement currency require the merchant's verified account details.

## Concrete next implementation

Choose a verified route after checking merchant eligibility: Razorpay Standard Checkout with PayPal, or a direct PayPal integration in an eligible supported currency. Neither route is implemented or activated by this change. Keep the existing INR flow gated while this is resolved.

A new route needs server-owned plan/currency/amount, authenticated order creation, fixed HTTPS return URLs, provider-specific verification, exactly-once captured-payment credits and verified refund reconciliation. A browser redirect is never proof of payment. The existing Payment Link webhook must not accept a different provider's event format.

Use isolated provider sandbox credentials and a separate test ledger. Check success/failure/cancellation, forged and duplicate events, partial/full refunds, event order and uncertain timeouts before selecting live settings. Test credits must not fund production AI calls. Secrets stay in the approved server secret flow; personal KYC is completed only with owner approval in the provider's own flow.

Before launch, complete merchant verification, actual email/social integration tests and final HTTPS origins/redirects/security headers, remove the retained disabled test fixture when no longer needed, then obtain the separate owner decisions for publication and live payment collection. Arabic support alone is not evidence of customer demand or revenue.

References checked 9 October 2026:

- [Razorpay international payments and business types](https://razorpay.com/docs/payments/international-payments/)
- [Razorpay PayPal integration and checkout limitation](https://razorpay.com/docs/payments/payment-methods/wallets/paypal/)
- [PayPal supported currencies](https://developer.paypal.com/reports/reference/supported-currencies)
- [Current INR Test Mode handoff](PAYMENT_SETUP.md)
