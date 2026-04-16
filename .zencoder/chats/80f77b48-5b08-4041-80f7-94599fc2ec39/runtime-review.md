# Runtime Behavior Review

**Step**: 3 — Runtime Behavior Review
**Agent**: Next.js Runtime Agent
**Date**: 2026-04-13
**Status**: complete

---

## Runtime Surfaces Affected

### 1. `src/app/layout.tsx` — Root Layout (Server Component)

**Runtime**: Node.js (server-side)
**Rendering mode**: With `cacheComponents: true`, the Root Layout is subject to prerendering as the static shell. The `env.*` accesses in `layout.tsx` are evaluated at prerender time.

**Current behavior**:

- `isNewRelicCdnBrowserEnabled` is computed at render time (prerender)
- Evaluates `env.NEW_RELIC_BROWSER_ENABLED`, `env.NEW_RELIC_BROWSER_LICENSE_KEY`, `env.NEW_RELIC_BROWSER_APP_ID`
- These are server-side env vars (not `NEXT_PUBLIC_`), resolved from `process.env`
- On Vercel: env vars set in the dashboard ARE available at build/prerender time ✓
- **No `await connection()` in RootLayout** → layout renders as static prerender shell

**Key constraint**: AGENTS.md states: "When `cacheComponents: true` is active, Next.js 16 **forbids** `export const dynamic` and `export const runtime`". The fix must NOT use `export const dynamic = 'force-dynamic'`.

**Key constraint**: AGENTS.md states: "`await connection()` is the only supported dynamic opt-in under the Cache Components model."

### 2. `src/app/observability/new-relic-browser.js/route.ts` — Route Handler

**Runtime**: Node.js
**Rendering**: Dynamic (has `await connection()`) ✓
**Response**: Returns JavaScript content

**Correct usage**: `await connection()` is present ✓. The route handler correctly opts into dynamic rendering.

**Issue**: The route handler is unnecessary for the CDN mode. In CDN mode, the initialization config (licenseKey, appId, accountId) should be inlined directly into the HTML `<head>`, not fetched via an async route. The route handler was designed for APM-linked browser timing (`getBrowserTimingHeaderSafe()`), which requires a live APM agent connection.

### 3. `<Script strategy="afterInteractive">` — Next.js Script Component

**Runtime**: Browser (client-side)
**Loading timing**: After React hydration completes

**Hard constraint**: For browser monitoring / telemetry agents, `afterInteractive` is architecturally incorrect. Monitoring agents must load BEFORE user interactions to:

- Record accurate page load timing (LCP, FCP, TTFB)
- Instrument XHR/Fetch from the start
- Capture JavaScript errors during hydration
- Record the first meaningful page view with full timing data

**Correct strategy for NR Browser**: `beforeInteractive` (loads before React hydration) or an inline `<script>` tag in `<head>` for the config object.

### 4. `dangerouslySetInnerHTML` in Server Component `<head>`

**Runtime**: Server (rendered to HTML string, no client execution risk)
**Safety**: Safe in a Server Component (`layout.tsx` is a Server Component). The content is generated from server-side env vars (not user input). No XSS vector.

**Constraint**: The NR Browser `licenseKey`, `appId`, and `accountId` are NOT secrets. They are browser-visible values embedded in every page's HTML by the NR UI copy/paste snippet. It is safe and standard practice to embed them inline in HTML.

---

## Caching and Revalidation Analysis

### Layout prerender behavior

With `cacheComponents: true`:

- The Root Layout acts as the static shell (prerendered)
- `env.*` values used in the layout are captured at prerender time
- NR Browser config values (licenseKey, appId) are static per deployment → prerendering is SAFE and DESIRABLE
- The NR script tag + inline config become part of the static shell → served from cache without per-request computation

### Route handler caching

`Cache-Control: no-store` is set on the route response ✓. Correct for dynamic monitoring script.

If CDN mode moves to direct `<head>` injection, the route handler's CDN code path becomes dead code.

---

## Environment Variable Exposure

### Current (server-only vars)

`NEW_RELIC_BROWSER_ENABLED`, `NEW_RELIC_BROWSER_LICENSE_KEY`, `NEW_RELIC_BROWSER_APP_ID`, `NEW_RELIC_BROWSER_ACCOUNT_ID` are declared as server-side in `env.ts` (no `NEXT_PUBLIC_` prefix).

**Issue**: These values are written into the HTML `<head>` (either as the JS snippet from the route, or as proposed inline config). They are **browser-visible by definition** — the browser must read them to initialize the agent. Therefore, keeping them as server-only vars is structurally correct (they never enter the client JS bundle), but they DO appear in the HTML response.

**Recommendation**: No change to `NEXT_PUBLIC_` prefix needed. Server Component `layout.tsx` can access them directly and inline them into the HTML response. This is the standard NR Browser CDN approach.

---

## Next.js Script Strategy Constraints

| Strategy            | Load timing                    | Use for                               |
| ------------------- | ------------------------------ | ------------------------------------- |
| `beforeInteractive` | Before React hydration, blocks | Monitoring agents, critical polyfills |
| `afterInteractive`  | After hydration                | Analytics, non-critical scripts       |
| `lazyOnload`        | During idle                    | Low-priority, non-essential           |
| `worker`            | In web worker                  | Non-DOM scripts                       |

**Required strategy for NR Browser CDN**: `beforeInteractive`

**Note**: `beforeInteractive` scripts are rendered into the initial HTML response by Next.js. The `src` URL must be absolute or a relative path. `https://js-agent.newrelic.com/nr-spa.min.js` is an absolute external URL — this is valid with `beforeInteractive`.

**Warning**: `strategy="beforeInteractive"` with an external URL adds it to a script tag that loads synchronously in `<head>`. This slightly impacts TTFB. Acceptable trade-off for monitoring.

---

## Route Handler Fate

The `/observability/new-relic-browser.js` route handler should be kept for APM-linked mode (local dev / self-hosted where NODE_OPTIONS works). For CDN mode, the route is bypassed entirely — the layout injects the config inline and points directly to the NR CDN.

The route handler's CDN code path (`if (env.NEW_RELIC_BROWSER_ENABLED)`) should be removed to avoid dead code and confusion. The CDN snippet should not go through the route handler.

---

## Runtime Constraints Summary

| Constraint                                 | Source                                   | Impact                                                         |
| ------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------- |
| No `export const dynamic`                  | AGENTS.md / `cacheComponents: true`      | Cannot force-dynamic the layout                                |
| `await connection()` for dynamic opt-in    | AGENTS.md                                | Only available in route handlers / RSC pages, not layout shell |
| `beforeInteractive` for monitoring agents  | Next.js docs / monitoring best practices | Must change script strategy                                    |
| NR config values are browser-visible       | NR Browser architecture                  | Safe to inline in HTML                                         |
| Server-only module guard on `new-relic.ts` | `import 'server-only'`                   | No change needed                                               |
