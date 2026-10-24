# Velo Canva creative bridge

An optional React 19/TypeScript module for linking Canva designs and Brand
Templates to **existing scheduled posts**. This increment adds new files only.
It does not mount itself, edit the dashboard, modify Auth or SQL, add a bucket,
alter post/media persistence, change approval or enqueue/publish anything.

## What is implemented

- English/Arabic, RTL and mobile interface with scoped plain CSS; no new package.
- Clean Canva design/Brand Template bookmarks, with explicit **unverified link**
  labels. Links open in Canva; no iframe, external script or thumbnail request.
- Optional connected-account search, explicit cursor pagination and selection.
  The new server endpoint returns metadata, not access/refresh tokens, signed
  thumbnails, owner details, preview capabilities or downloaded/exported media.
- Explicit one-creative-per-post mapping and replacement. Records live in the
  separate `velo:canva-bridge:v1:<owner UUID>` browser key. Old keys are not read
  or changed. Up to 100 saved references and 200 mappings per account/browser.
- A SHA-256 snapshot covers all existing Post fields, including status, revision,
  caption, hashtags, media and scheduled time. Changed/unscheduled/missing posts
  require review. An account selection is fetched again immediately before
  mapping; a changed Canva `updated_at` refuses the mapping.
- Bounded/cancellable UI reads; synthetic tests cover owner switching, changed
  posts, changed source, partial configuration, storage conflicts and RTL.

## Important scope

**The module is unmounted, default-off and not deployed.** Local bookmarks and
mapping can be tested by an opt-in host without connecting Canva. Actual account
browsing still requires the separate held OAuth/database/runtime setup described
in `docs/VELO_ASSET_CONNECTIONS.md`; this module does not activate that setup.

Current official documentation says accessible Brand Templates can be read on
plans that include them, such as Canva Pro, Teams or Enterprise. That does not
mean access to Canva's complete Pro stock/template marketplace. The API lists
the user's own/shared designs and accessible Brand Templates. It is not a full
Canva editor embedded inside Velo or a Pro stock search/download service.

Existing OAuth code requests **only `design:meta:read`**. This increment leaves
that code and its client-side consent validation unchanged. Therefore account
design browsing can use that existing scope when the connection is activated;
Brand Template browsing correctly returns `scope_required` before a template
GET. Manual Brand Template links remain usable as unverified references. The
transport includes Brand Template read support for a future separately reviewed
grant containing `brandtemplate:meta:read`; no current UI requests that scope.
The existing refresh helper deliberately returns its existing minimal scope,
so a future Brand Template rollout must review consent **and refreshed-grant
scope handling** together. Do not force-enable or edit stored grants to bypass it.

Mapping a reference does not download, export, license or attach publishable
media to `Post.media`. Changing the Canva source later does not update a post or
renew approval. A real export/import pipeline must separately pin bytes/revision
and run the existing media and approval checks. Existing scheduled posts and
their publishing worker ignore this sidecar mapping, so scheduling behavior is
unchanged. All real publisher activity remains gated as before.

## New file structure

```text
src/features/canva-bridge/
  CanvaCreativeBridge.tsx    # Optional panel; never imported by App.tsx
  types.ts                  # Typed props, catalog and sidecar records
  catalog.ts                # Injected catalog API + cancellation/deadlines
  velo-catalog.ts           # Existing fixed-project Supabase client adapter
  mappings.ts               # Owner-scoped local sidecar, fingerprint checks
  labels.ts                 # Separate English/Arabic strings
  canva-bridge.css          # Selectors scoped to .velo-canva-bridge
  README.md
supabase/functions/_shared/canva-catalog/
  contracts.ts              # Pure shared validation; no I/O/secrets
  transport.ts              # Fixed Canva metadata GETs, bounded response
  service.ts                # New handler using existing Auth/grant contracts
supabase/functions/velo-canva-catalog/
  index.ts                  # Inactive new entrypoint
  deno.json
tests/
  canva-bridge.test.mjs
  fixtures/canva-catalog-server.ts
e2e/
  canva-bridge.spec.ts
  fixtures/canva-bridge-harness.tsx
docs/
  CANVA_BRIDGE_CHECKPOINT_20261024.md
  evidence/canva-bridge-20261024.json
```

Copy the module's new directories/files into the **existing** Velo repository,
preserving their relative paths. This is not a standalone replacement app. It
depends on existing React/Supabase packages, `src/types.ts`, the existing asset
connection client and server runtime/protocol/security helpers. The archive
contains no copies or overwrites of those old files and no credentials.

## Optional dashboard host

The user prohibited existing core-file edits, so this increment does not add a
navigation item or import into `App.tsx` or `ModuleWorkspace.tsx`. These are
complete component props for a later approved mount in an existing extension
slot or a separate host; preserve the existing Auth source and pass its current
owner UUID and read-only posts. Do not create a second Auth provider or client.

```tsx
import CanvaCreativeBridge from './features/canva-bridge/CanvaCreativeBridge'
import type { Post } from './types'

export function OptionalCreativePanel({
  userId, posts, active = false, arabic = false,
}: {
  userId: string
  posts: readonly Post[]
  active?: boolean
  arabic?: boolean
}) {
  return <CanvaCreativeBridge
    ownerId={userId}
    posts={posts}
    enabled={active}
    locale={arabic ? 'ar' : 'en'}
  />
}
```

`active=false` does not read browser records or make an account request. Once
explicitly mounted with `active=true`, manual link mapping works locally. A click
on **Load Canva library** or **Connect Canva** only proceeds when the separate
existing connection gate and the new catalog gate are both configured. Consent
navigation is a separate user click on the validated Canva authorization URL.
Nothing calls a provider on panel mount.

`catalog` and `storage` props are dependency-injection seams for isolated hosts
and tests. The included harness uses made-up designs/posts and no external
network. A host must provide only the current owner's posts; the `Post` type
does not contain an owner field. No browser prop/localStorage record is a
backend authorization boundary.

## Future connected-account setup — held, not performed here

1. Complete the AasiFlowAI-only backup/recovery and existing asset-runtime
   release review. This increment makes **no database schema change**. The
   pre-existing unapplied asset-connection proposal/runtime must be reviewed
   separately; their absence must not be worked around with browser tokens.
2. Create/configure the intended Canva Web integration, approved site origin and
   exact existing callback in the existing connection guide. Client secret and
   grant-encryption key are server-only. A Pro account is not OAuth consent.
3. Review/release the separate `velo-canva-catalog` function only when hosted
   release is authorized. Preserve server Auth verification, active session,
   membership/grant lease checks, fixed project and exact-origin CORS. The
   function is intentionally absent from the existing release manifest.
4. Server requires both `AASIFLOW_ASSET_CONNECTIONS_ENABLED=true` and the new
   `AASIFLOW_CANVA_CATALOG_ENABLED=true`, plus the existing task-scoped asset
   app/Canva/encryption configuration. The browser requires existing
   `VITE_VELO_ASSET_CONNECTIONS=true` and new `VITE_VELO_CANVA_BRIDGE=true`.
   These switches are not secrets or consent. No switch was set by this change.
5. Review an explicit mount separately, then test real owner consent/revocation,
   own/shared design access and exact account separation on mobile. Brand
   Template access requires its own approved scope/refresh review as above.

No `VITE_` client secret, access token, refresh token, service-role key or account
password is used. The server reuses the existing `velo_asset_command` claim and
finish lease commands; it cannot add SQL or accept a browser-supplied owner. A
refresh is attempted once only when needed, and rotated encrypted credentials
are persisted even after a metadata GET failure. If finish is uncertain, no
catalog data is returned. Expired/failed grant refresh requires reconnection.
This source was tested with fake grants only, never against a hosted account.

## Limits and failure behavior

- Transport metadata responses: 256 KiB maximum including streamed/decompressed
  bytes, 10-second whole-response deadline, maximum 100 items/page, no redirects
  or automatic retries. Only `GET /designs`, `GET /designs/{id}`,
  `GET /brand-templates` and `GET /brand-templates/{id}` can be constructed.
- No export/Autofill/upload/delete/share/publish endpoint or arbitrary URL fetch.
  Existing OAuth refresh/introspection may use their existing fixed POST paths
  server-side when the real runtime is separately activated.
- UI deadline is 60 seconds for the entire signed-in runtime operation. Stopping
  or unmounting prevents a late local mapping; it cannot promise an already-sent
  server refresh/lease request was undone. Switching owners remounts the panel.
- Browser records can be lost when storage is cleared, are visible to scripts on
  the same origin and are **not cross-device or durable backend synchronization**.
  They contain only IDs/titles/timestamps/fingerprints, not captions/media bytes
  or credentials. Corrupt/oversized records are blocked rather than reset.
- Optimistic raw-value checks and `storage` events prevent observed tab conflicts
  from silently overwriting records. Web Storage offers no multi-tab transaction;
  simultaneous unobserved writes are not guaranteed conflict-free. No exactly-once
  publishing/durable queue claim is made.
- Generated canonical links may require existing Canva sharing permissions.
  A pasted link is never proof of account access, Pro plan or content licensing.
- SHA-256 is a local change detector, not a server authorization or approval.
  Canva `updated_at` is not immutable asset bytes; later changes require a new
  check/export in a future integration. Mappings are deliberately ignored by the
  publishing worker until that separate workflow is implemented and reviewed.

## Validation

From the existing repository:

```bash
node --test tests/canva-bridge.test.mjs
npm run lint
npm run check:edge
npm run check:e2e
npm run build
npm run test:e2e -- e2e/canva-bridge.spec.ts
```

The Node suite includes a child process using the repository's Node 24 runtime
and `--experimental-transform-types` for the seven grant/handler tests. This
lets unchanged CI discover the new tests without modifying its runner. All
transport grants/files are synthetic. Existing Edge TypeScript includes the new
entrypoint; it was also checked separately with Deno 2.9.6. The existing release
manifest and runtime checks remain unchanged. Read the dated checkpoint/current
commit's CI for actual counts and limitations; these commands alone are not proof.

## Official API references checked 24 October 2026

- [Design listing and required scope](https://www.canva.dev/docs/apps/rest-apis/reference/designs/list-designs/)
- [Brand Template listing, plan access and separate scope](https://www.canva.dev/docs/apps/rest-apis/reference/brand-templates/list-brand-templates/)
- [Brand Template metadata](https://www.canva.dev/docs/apps/rest-apis/reference/brand-templates/get-brand-template/)
- [OAuth Authorization Code + PKCE](https://www.canva.dev/docs/apps/rest-apis/authentication/)
- [Supabase function invocation](https://supabase.com/docs/reference/javascript/functions-invoke)
