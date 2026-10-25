# Canva bridge checkpoint — 24 October 2026

Scope: only `createwithnk/ai-social-manager`, development branch
`fix/beta-readiness-20261019`. Starting source:
`2a4f956d850f0634af328211bb61d1b05a83368d`, verified against the remote and
successful [CI 40097776189](https://github.com/createwithnk/ai-social-manager/actions/runs/40097776189).
Preserve unavailable laptop checkpoint `21e8dce`.

The owner requested a new Canva creative bridge without touching existing core,
Auth, schema or another project. This increment adds **new files only**. Every
previously tracked file, including the Drive importer, OAuth protocol/client,
dashboard, post/media persistence, historical SQL, dependencies, styles,
security headers, release manifest and previous checkpoints, is unchanged.

## Implemented

- Optional, unmounted React component with English/Arabic RTL and scoped CSS.
- Clean design/Brand Template bookmarks and explicit metadata selection/search/
  pagination through an injected catalog contract.
- Separate owner/browser sidecar mapping to existing scheduled posts. Full-post
  fingerprints, change/unscheduled/missing status, explicit replacement/removal,
  safe storage failure/conflict behavior, late-result and owner-switch guards.
- New default-off server catalog endpoint reuses the fixed AasiFlowAI runtime,
  existing Auth/session validation and encrypted grant lease commands. Bounded
  Canva GET metadata only; tokens, signed links, thumbnails and owner details
  are dropped. Rotated grants are finished even after a metadata GET failure.
- Complete [file tree, usage, setup and limits](../src/features/canva-bridge/README.md).

No post, approval, schedule, publishing queue or existing media reference can be
written by this module. No hosted action, other project, real provider account,
deployment, message, payment or main merge was performed.

## Actual local validation

- **163 top-level Node tests** passed, including the 15 new module tests. One of
  those runs **7 additional isolated grant/handler cases** in a child Node 24
  TypeScript-transform process; do not add those seven to the top-level total.
- Existing **81 isolated SQL checks** passed; no live SQL or networking.
- **14 new browser cases** passed on desktop/mobile. The recovered-storage
  scenario was rechecked after its test-only factory cleanup. All non-local
  browser requests were blocked. Old passing browser cases were left for CI.
- Lint, app build/TypeScript, Edge TypeScript, browser TypeScript, unchanged
  release-manifest verification and whitespace checks passed. New inactive
  endpoint separately checked with cached Deno 2.9.6. No dependency changed.
- Existing production JS/CSS names/hashes remain unchanged because no production
  route imports the optional component. Initial dropdown-label and test-fixture
  lint findings were corrected; failed attempts are not counted as passes.
- Read the **actual newly pushed head's CI**, rather than treating starting-source
  CI or these synthetic tests as hosted/provider acceptance. The existing CI
  runner discovers the new Node/browser files without an old-file edit.

Read [source hashes/local evidence](evidence/canva-bridge-20261024.json).

## Exact boundaries and remaining work

**Not mounted, enabled, connected or deployed.** Local mapping can run in an
explicitly opted-in host. Records are browser/account scoped, not cross-device
backend persistence. A linked reference is not publishable media or a renewed
approval; the existing worker deliberately ignores it.

The existing Canva consent/refresh flow requests only `design:meta:read` and
remains byte-for-byte unchanged. Actual own/shared-design browsing needs the
previously held asset OAuth/private-runtime setup. Brand Templates additionally
require `brandtemplate:meta:read`; the new transport supports that scope but the
current flow does not grant it. Requests without it fail before a template GET.
Future consent and refreshed-scope handling require one separate review. Never
edit stored grants or widen old validation to suppress this gate.

A Pro subscription alone is not app consent or access to the complete Pro stock
marketplace. No stock asset search, full Canva editor, Autofill/export, media
download/import or automatic design synchronization was added.

Actual AasiFlowAI backup inventory/recovery, held SQL/runtime/identity release,
real provider/no-charge acceptance and human Arabic/accessibility acceptance are
still outstanding. The prior scoped backup-read token was absent; this module
does not retry unchanged prerequisites or infer backups exist/are missing.

Next safe step: verify expected-parent/source-tree development push and current
CI, preserve this module, then review a dashboard extension-slot mount and the
existing connection prerequisites without activating held hosted/provider
actions. Do not rerun unchanged passing audits or claim Beta launch readiness.
