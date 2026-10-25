# Velo social publishing dashboard

Optional, unmounted React/TypeScript feature. It adds no database migration,
does not edit Auth, existing publishing workers, Drive import, Canva bridge,
or DarulIlm. All CSS selectors are scoped to `.velo-social-publishing`.

## Included

- English and Arabic labels, `lang` and RTL `dir`; responsive mobile cards.
- Status cards for Instagram Business, TikTok, YouTube Shorts, Snapchat and
  Google Business Profile.
- Queue display and explicit cancellation for scheduled/failed items.
- Runtime validation for injected service responses; no secrets or tokens are
  stored in the browser by this module.
- Disabled-by-default mount. It makes no requests unless the host explicitly
  supplies an API adapter and sets `enabled`.

## Integration contract

The host supplies a `SocialPublishingApi` adapter with `load()`,
`connect(platform)` and `cancel(postId)`. Keep provider credentials server-side.
The adapter must call authenticated, owner-scoped server endpoints, enforce
authorization and CSRF/origin protections, and return only safe connection
metadata and queue fields. Do not pass access/refresh tokens to this component.
Do not wire it to the database directly from the browser.

```tsx
import SocialPublishingDashboard from './features/social-publishing/SocialPublishingDashboard'
import type { SocialPublishingApi } from './features/social-publishing/types'

// The host must provide its already-approved, authenticated adapter.
<SocialPublishingDashboard enabled={false} locale="en" api={approvedApi} />
```

The existing `src/features/publishing/connectors.ts` describes five provider
requirements and deliberately remains preview-only. This dashboard is an
integration seam, not evidence that provider OAuth, live publishing, or
queue mutations are configured. Its default-off behavior is intentional.
Actual account connection and publication require separate provider approval,
scoped server adapters, and end-to-end tests against authorized accounts.
