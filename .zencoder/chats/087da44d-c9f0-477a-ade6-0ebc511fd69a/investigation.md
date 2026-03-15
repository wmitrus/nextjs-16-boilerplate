# Bug Investigation: pnpm dev Auth Flow Stuck

## Bug Summary

Under `pnpm dev`, the browser gets stuck after Clerk auth completes and the server redirects through `/auth/bootstrap`. The server-side flow succeeds (Clerk identity resolves, provisioning works, redirects fire), but the browser cannot complete the navigation and render correctly. `pnpm start` works fine.

---

## Root Cause Analysis

### Runtime Architecture Clarification (Next.js Runtime Agent)

**`src/proxy.ts` is a Next.js 16 "proxy" file** — a new first-class concept in Next.js 16. It runs in the **Node.js runtime** (not edge), confirmed by:

- `PROXY_FILENAME = 'proxy'` constant in Next.js 16 source
- `isProxyFile(page) → params.onServer()` — deliberately runs in the Node.js server, not edge
- Next.js server loads it via `loadNodeMiddleware()` and calls `middlewareModule.proxy || middlewareModule.middleware || middlewareModule.default`
- The `middleware-manifest.json` being empty is **expected** — proxy files don't register as edge middleware

This is architecturally correct. The `createEdgeRequestContainer` name is misleading since the proxy itself runs in Node.js, but the container's composition (edge-safe module graph, no DB) remains appropriate for the security pipeline.

### Primary Cause: Missing `wss://` protocol in CSP `connect-src` for Clerk dev domains

**File**: `src/security/middleware/with-headers.ts`

The CSP `connect-src` directive includes Clerk's dev domain under `https://` protocol only:

```typescript
if (isPreview || isDev || isClerkDevKey) {
  clerkDomains.push('https://*.clerk.accounts.dev'); // ← https only, no wss://
}
```

The CSP `connect-src` allows `https://*.clerk.accounts.dev` but NOT `wss://*.clerk.accounts.dev`.

**The CSP `https://` prefix does NOT cover WebSocket (`wss://`) connections** — they are distinct schemes in the CSP spec. A browser cannot open `wss://example.com` if only `https://example.com` is listed in `connect-src`.

**Clerk v6 dev mode behavior** (`pk_test_` keys, frontendApi: `pleased-hound-90.clerk.accounts.dev`):

- Clerk's browser JS is loaded via `<script>` from `https://pleased-hound-90.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js` (confirmed in Clerk shared source: `loadClerkJsScript-BtksLb-o.mjs`)
- Once loaded, it establishes connections back to the Clerk FAPI and may use WebSocket connections for real-time session state synchronization in dev mode
- The browser console shows CSP-blocked connections — the `wss://` variant being absent is the most likely cause

### Why `pnpm start` works

Under `pnpm build && pnpm start`:

- `NODE_ENV=production` → `isDev = false`
- `pk_test_` key → `isClerkDevKey = true` → `https://*.clerk.accounts.dev` IS still added to CSP
- **Critical difference**: In production build mode, Clerk's browser JS behaves differently. Even with the same `pk_test_` key, the production-built JS bundle initializes Clerk in a "production-served-dev-key" mode that uses fewer real-time connections

If Clerk's dev client specifically initiates WebSocket connections **only when running under Turbopack dev server** (or only when the app itself is in `NODE_ENV=development`), then the `wss://` block only manifests in `pnpm dev`.

### Secondary Runtime Finding: Turbopack HMR is not the cause

The proxy matcher explicitly excludes `_next`:

```
'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|...'
```

Turbopack's HMR WebSocket connects at `/_next/webpack-hmr` on the same origin (`ws://localhost:3000`). This is:

- Excluded from the proxy matcher → proxy doesn't run → no CSP header applied to HMR responses
- Covered by `'self'` in `connect-src` regardless (same host/port)

Turbopack HMR is **not** the cause of the browser getting stuck.

### Tertiary Concern: `cacheComponents: true` + CSP

With `cacheComponents: true` enabled in `next.config.ts`, cached component boundaries could theoretically serve cached responses. However, the CSP header is applied by the Node.js proxy **per-request** before the response is assembled, so cached component payloads are served with the same CSP. **No caching risk for CSP headers.**

---

## Affected Components

| File                                           | Issue                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/security/middleware/with-headers.ts`      | Missing `wss://*.clerk.accounts.dev` in `connect-src` when `isDev \|\| isClerkDevKey` |
| `src/security/middleware/with-headers.test.ts` | No test for `wss://` Clerk dev domains in `connect-src`                               |

---

## Why Not the Env File Approach

The `NEXT_PUBLIC_CSP_CONNECT_EXTRA` env mechanism exists for **project-specific third-party services** that are deployment-specific. The `wss://*.clerk.accounts.dev` requirement is a **systematic, predictable consequence of using Clerk `pk_test_` keys** — it will affect every developer using this boilerplate. It belongs in code via the already-existing `isClerkDevKey` detection.

Using the env file here would:

- Require every developer to know to add it to `.env.local`
- Not be documented by default
- Break silently for new setups

The env file approach (`NEXT_PUBLIC_CSP_CONNECT_EXTRA=wss://*.clerk.accounts.dev`) is valid as an **immediate workaround** if a fast test is needed, but the correct permanent fix is in code.

---

## Proposed Solution

**Minimal code fix in `src/security/middleware/with-headers.ts`**:

Change the `clerkDomains` dev push from:

```typescript
if (isPreview || isDev || isClerkDevKey) {
  clerkDomains.push('https://*.clerk.accounts.dev');
}
```

To:

```typescript
if (isPreview || isDev || isClerkDevKey) {
  clerkDomains.push('https://*.clerk.accounts.dev');
  clerkDomains.push('wss://*.clerk.accounts.dev');
}
```

This adds the WebSocket protocol variant only when the dev Clerk domain is already being added — zero blast radius change.

**Test update in `src/security/middleware/with-headers.test.ts`**:

1. Add assertion to existing dev CSP test:

```typescript
it('should include development-specific CSP rules', () => {
  // existing...
  expect(csp).toContain('https://*.clerk.accounts.dev');
  expect(csp).toContain('wss://*.clerk.accounts.dev'); // ← add
});
```

2. Add assertions to preview CSP test:

```typescript
it('should include preview-specific CSP rules', () => {
  // existing...
  expect(csp).toContain('https://*.clerk.accounts.dev');
  expect(csp).toContain('wss://*.clerk.accounts.dev'); // ← add
});
```

---

## Implementation Notes

- The fix is **one line** in `with-headers.ts` plus test assertions
- No new env vars required
- `wss://` is only added alongside `https://` in dev/preview/clerk-dev-key contexts — production is unaffected
- The preview branch (Vercel preview deploys with `pk_test_` keys) also benefits
- Fast workaround for local dev: `NEXT_PUBLIC_CSP_CONNECT_EXTRA=wss://*.clerk.accounts.dev` in `.env.local`

## Next.js 16 Runtime Notes

- `src/proxy.ts` = Next.js 16's renamed "middleware" (proxy), runs in Node.js — **correctly wired**
- `middleware-manifest.json` being empty is expected for proxy.ts (it's not an edge middleware entry)
- `createEdgeRequestContainer` naming is slightly misleading but functionally correct — it produces an edge-safe composition (no DB, no Node-only APIs) even though the proxy itself runs in Node.js
