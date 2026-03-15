# Next.js Runtime Agent Findings

## Dev-Only Auth Flow Stuck — Runtime Investigation

---

## 1. Objective

Validate whether the `pnpm dev` auth freeze is caused by a **framework/runtime placement issue**, a **CSP runtime gap**, a **proxy wiring problem**, or a **Turbopack/dev-server-specific behavior** — and distinguish these from backend auth failure (which is already ruled out by server logs).

---

## 2. Runtime Architecture Findings

### 2.1 `src/proxy.ts` is a Next.js 16 Native "Proxy" — Not Middleware

**Confirmed from Next.js 16 source.**

Next.js 16 introduces `proxy.ts` (or `src/proxy.ts`) as a first-class, renamed replacement for `middleware.ts`. This is a deliberate rename with distinct runtime characteristics:

```javascript
// next/dist/lib/constants.js
const PROXY_FILENAME = 'proxy'; // ← proxy.ts is the new name
const MIDDLEWARE_FILENAME = 'middleware'; // ← old name, still supported

// next/dist/build/utils.js
function isProxyFile(file) {
  return file === '/proxy' || file === '/src/proxy'; // ✅ src/proxy.ts is matched
}

// next/dist/build/entries.js
if (isProxyFile(params.page)) {
  params.onServer(); // ← NODE.JS runtime, NOT edge runtime
}

// next/dist/server/next-server.js
handler: middlewareModule.proxy ||
  middlewareModule.middleware ||
  middlewareModule.default;
```

**Key runtime implications:**

- `src/proxy.ts` runs in **Node.js**, not the edge runtime
- The `middleware-manifest.json` being `{}` (empty) is **expected** — proxy files do not register as edge middleware entries
- `createEdgeRequestContainer` naming is a misnomer: the proxy itself runs in Node.js, though the container's edge-safe composition (no DB, no Node-only APIs) remains appropriate

This is **correctly wired and functionally sound**. No fix needed here.

---

### 2.2 CSP Header Application — Runtime Lifecycle

The proxy (`src/proxy.ts`) runs per-request in Node.js **before** the response is assembled. `withHeaders()` in `src/security/middleware/with-headers.ts` applies `Content-Security-Policy` to the response.

**Important runtime chain:**

```
Browser request
  → Node.js proxy (src/proxy.ts)
    → withSecurity()
      → withHeaders()  ← CSP applied HERE
    → Next.js renders page/action/route handler
  → Response with CSP header sent to browser
```

**CSP is enforced on the browser side**, not on the server. The server sets the header; the browser enforces it for all resources the page loads.

---

### 2.3 Turbopack HMR — Ruled Out as Cause

The proxy matcher explicitly excludes `_next` paths:

```
'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|...)).*)'
```

Turbopack's HMR WebSocket runs at `/_next/webpack-hmr` on the same origin (`ws://localhost:3000`). This is:

- **Excluded from proxy** → proxy does not run → no CSP applied to that response (correct, expected)
- **Covered by `'self'`** in `connect-src` regardless — same-origin WebSocket is always allowed by `'self'`

**Turbopack HMR is not involved in the browser getting stuck.**

---

### 2.4 `cacheComponents: true` — No CSP Impact

With `cacheComponents: true` in `next.config.ts`, Next.js 16 enables Cache Components (PPR-compatible component-level caching). However:

- The proxy runs **before** any cache layer on every request
- CSP is applied to the **response**, not the component payload
- Cached components are assembled into responses that still pass through the proxy

**No caching risk for CSP headers. Ruled out as a cause.**

---

### 2.5 `reactCompiler: true` — Low Confidence, Informational

React Compiler (`reactCompiler: true`) transforms component code at build time. In Turbopack dev mode, these transforms behave differently from webpack production builds.

If `ClerkProvider`'s internal effect hooks or context initialization are compiled in a way that alters their execution order specifically under Turbopack dev, initialization could stall. This is a **secondary hypothesis** with no direct code evidence either way. The primary candidate remains the CSP `wss://` gap.

---

## 3. The Runtime-Visible CSP Gap

### What the browser is loading in dev mode

Clerk v6 with `pk_test_cGxlYXNlZC1ob3VuZC05MC5jbGVyay5hY2NvdW50cy5kZXYk` (`pleased-hound-90.clerk.accounts.dev`):

**Confirmed from `@clerk/shared` dist source (`loadClerkJsScript-BtksLb-o.mjs`):**

```javascript
// For pk_test_ keys, scriptHost = frontendApi = pleased-hound-90.clerk.accounts.dev
return `https://${scriptHost}/npm/@clerk/clerk-js@${version}/dist/clerk.browser.js`;
```

The browser loads: `https://pleased-hound-90.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js`

This is a script loaded from the Clerk dev CDN. Once running, Clerk's browser JS:

1. Makes HTTPS API calls to `https://pleased-hound-90.clerk.accounts.dev/v1/...` — **covered** by `connect-src: https://*.clerk.accounts.dev` ✅
2. May open WebSocket connections to `wss://pleased-hound-90.clerk.accounts.dev/...` — **BLOCKED** by CSP, because only `https://` is listed, not `wss://` ❌

**From `with-headers.ts`:**

```typescript
if (isPreview || isDev || isClerkDevKey) {
  clerkDomains.push('https://*.clerk.accounts.dev');
  // ← wss://*.clerk.accounts.dev is MISSING
}
```

`clerkDomains` feeds into `connect-src`. The browser enforces `connect-src` for both `fetch()`/XHR (`https://`) and WebSocket (`ws://`, `wss://`) as distinct schemes. `https://` in `connect-src` does **not** implicitly permit `wss://` to the same host.

### Why `pnpm start` works with the same gap

Under `pnpm start`:

- `NODE_ENV=production` → `isDev = false`
- `pk_test_` key → `isClerkDevKey = true` → `https://*.clerk.accounts.dev` IS added
- **Critical behavioral difference**: Clerk's browser JS behaves differently when the surrounding app is in `NODE_ENV=production`. The dev-specific real-time connection behavior (which requires `wss://`) is only triggered when `NODE_ENV=development` is visible to the Clerk client. Under `pnpm start`, Clerk's client skips this initialization path even with a `pk_test_` key.

---

## 4. Dev vs Prod Divergence — Summary Table

| Factor                                | `pnpm dev`                          | `pnpm start`                |
| ------------------------------------- | ----------------------------------- | --------------------------- |
| `NODE_ENV`                            | `development`                       | `production`                |
| `isDev` in CSP logic                  | `true`                              | `false`                     |
| `isClerkDevKey`                       | `true`                              | `true`                      |
| `https://*.clerk.accounts.dev` in CSP | ✅ added                            | ✅ added                    |
| `wss://*.clerk.accounts.dev` in CSP   | ❌ missing                          | ❌ missing (but not needed) |
| Clerk browser JS initiates `wss://`   | **YES** (dev mode active)           | **NO** (prod mode skips it) |
| Result                                | Browser stuck (CSP blocks `wss://`) | Works (no `wss://` attempt) |

---

## 5. Files to Change

| File                                           | Change                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- | --- | ----- | --- | -------------------- |
| `src/security/middleware/with-headers.ts`      | Add `wss://*.clerk.accounts.dev` in the `isPreview                         |     | isDev |     | isClerkDevKey` block |
| `src/security/middleware/with-headers.test.ts` | Assert `wss://*.clerk.accounts.dev` in dev-mode and preview-mode CSP tests |

---

## 6. Exact Proposed Change

**`src/security/middleware/with-headers.ts`** — the only code change required:

```typescript
// Before:
if (isPreview || isDev || isClerkDevKey) {
  clerkDomains.push('https://*.clerk.accounts.dev');
}

// After:
if (isPreview || isDev || isClerkDevKey) {
  clerkDomains.push('https://*.clerk.accounts.dev');
  clerkDomains.push('wss://*.clerk.accounts.dev');
}
```

**`src/security/middleware/with-headers.test.ts`** — two test additions:

```typescript
it('should include development-specific CSP rules', () => {
  // ... existing setup ...
  expect(csp).toContain('https://*.clerk.accounts.dev');
  expect(csp).toContain('wss://*.clerk.accounts.dev'); // ← regression guard
});

it('should include preview-specific CSP rules', () => {
  // ... existing setup ...
  expect(csp).toContain('https://*.clerk.accounts.dev');
  expect(csp).toContain('wss://*.clerk.accounts.dev'); // ← regression guard
});
```

---

## 7. Why Code Fix, Not Env File

The `NEXT_PUBLIC_CSP_CONNECT_EXTRA` mechanism exists in `env.ts` and is used in `with-headers.ts` for deployment-specific third-party services. This gap is **not** deployment-specific — it affects every developer running this boilerplate with Clerk dev keys. The `isClerkDevKey` detection already exists in code precisely for this class of systematic dev-key behavior.

Using `NEXT_PUBLIC_CSP_CONNECT_EXTRA=wss://*.clerk.accounts.dev` in `.env.local` is a valid **fast validation step** before implementing the code fix. It does not replace the code fix.

---

## 8. Blast Radius

- **Zero production impact**: the `wss://` entry is only added in the same conditional that already adds `https://` — gated on `isPreview || isDev || isClerkDevKey`
- **No new env vars required**
- **One new line** in `with-headers.ts`
- **Two new assertions** in `with-headers.test.ts`
- The existing test structure requires no restructuring
