# Architecture Impact Review

**Step**: 4 — Architecture Impact Review
**Agent**: Architecture Guard Agent
**Date**: 2026-04-13
**Status**: complete

---

## Module Boundaries

### Affected Modules

| Module / Layer                                             | Files                  | Change Type                                                               |
| ---------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `src/core/observability/`                                  | `new-relic-browser.ts` | CDN snippet generator → remove dynamic script injection, add `NREUM.init` |
| `src/app/layout.tsx`                                       | Root layout            | Change script strategy + add inline config injection                      |
| `src/app/observability/new-relic-browser.js/route.ts`      | NR Browser route       | Remove CDN code path (keep APM path)                                      |
| `src/app/observability/new-relic-browser.js/route.test.ts` | Route test             | Update removed CDN assertions                                             |
| `src/core/observability/new-relic-browser.test.ts`         | CDN unit test          | Update for new snippet shape                                              |

### Dependency Direction

**Current**: `layout.tsx` → route handler (via browser fetch) → `new-relic-browser.ts`
**Proposed**: `layout.tsx` → `new-relic-browser.ts` (direct import, no route handler for CDN)

This is a **better dependency direction**: the layout directly imports the config generator rather than going through an HTTP round trip. The layout is a Server Component and CAN import server-only modules.

**No cross-module violations**: `src/core/observability/` is a core infrastructure module. `src/app/layout.tsx` importing from `src/core/observability/` is the correct direction (app → core).

---

## DI Usage

No DI container usage in this flow. The observability helpers are stateless pure functions. No change needed.

---

## Security Regressions

**CSP headers** (`src/security/middleware/with-headers.ts`):

- `script-src` already includes `https://js-agent.newrelic.com` ✓
- `script-src-elem` already includes `https://js-agent.newrelic.com` ✓
- `connect-src` already includes `https://bam.nr-data.net` ✓

With `strategy="beforeInteractive"`, Next.js adds the script to the static HTML. The `<Script>` component renders as a `<script src="...">` tag. The `script-src-elem` directive covers it ✓.

**Inline config script**: `dangerouslySetInnerHTML` in `layout.tsx`. The content is generated from env vars (not user input). The CSP includes `'unsafe-inline'` in `script-src` ✓. No XSS risk since the values are never user-controlled.

**Note**: The `unsafe-inline` is already present for other reasons (Clerk, etc.). The inline NR config does not introduce new CSP risk.

---

## Runtime Placement

**Before**: CDN path went through a route handler (Node.js runtime, dynamic)
**After**: CDN config is inlined in layout (prerender-safe, static shell)

The NR `<Script>` tag moves from route-handler-served to direct CDN reference. This is runtime-correct: no server processing needed for static CDN URLs.

The route handler remains valid for the APM-linked path (requires server-side evaluation of `getBrowserTimingHeaderSafe()` which needs the NR agent to be connected).

---

## Provider Isolation

The NR Browser CDN configuration values (`licenseKey`, `appId`, `accountId`) are already isolated in `src/core/observability/new-relic-browser.ts` behind the `getNrBrowserCdnSnippet()` / `isNrBrowserCdnEnabled()` functions. This isolation is preserved in the proposed fix.

The proposed change adds a new exported function (e.g., `getNrBrowserCdnConfig()`) that returns the raw config object (not the script string), allowing `layout.tsx` to use it for inline injection without regenerating the script.

Alternatively, `layout.tsx` can read `env.*` directly for the CDN config values since:

1. They are simple string/boolean values
2. Layout is a Server Component
3. No business logic involved

---

## Architecture Constraints Confirmed

| Constraint                                                 | Status                                   |
| ---------------------------------------------------------- | ---------------------------------------- |
| Module ownership respected                                 | ✓ app → core direction correct           |
| No `export const dynamic`                                  | ✓ fix does not use it                    |
| `await connection()` not needed in layout for prerender    | ✓ NR config is static, prerender is safe |
| Route handler kept for APM path                            | ✓ not removed                            |
| No new cross-module coupling                               | ✓                                        |
| Provider-specific logic stays in `src/core/observability/` | ✓                                        |

---

## Structural Risk

**Low**. The change is confined to:

1. Layout `<head>` additions (inline config + script strategy change)
2. Route handler CDN code path removal
3. `new-relic-browser.ts` function shape change

No core contracts, DI container, auth, or module boundaries are affected.

---

## Conclusion

The proposed fix is architecturally sound. It:

- Eliminates an unnecessary HTTP round trip (layout → route handler → CDN)
- Moves to correct loading strategy for monitoring agents
- Preserves module ownership and dependency direction
- Does not introduce new security risks
- Does not violate any `cacheComponents: true` constraints
- Keeps the route handler for the APM-linked mode (future use when APM works on Vercel)
