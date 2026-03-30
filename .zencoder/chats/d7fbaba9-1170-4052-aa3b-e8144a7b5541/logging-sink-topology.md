# Logging Sink Topology Investigation

**Date**: 2026-03-15  
**Agent**: Next.js Runtime Agent  
**Scope**: Logging infrastructure — sink routing, runtime boundaries, production gaps

---

## 1. Objective

Determine exactly how each runtime log class is routed today, why `type="Security"` logs appear only in the terminal, why `type="API"` logs appear only in `server.log`, and what the production-grade path must look like to make all log classes visible in Logflare after deployment.

---

## 2. Current-State Findings

### 2.1 Four Logger Implementations

| Logger              | File                          | Runtime | Sink mechanism                                                                  |
| ------------------- | ----------------------------- | ------- | ------------------------------------------------------------------------------- |
| **Server Logger**   | `src/core/logger/server.ts`   | Node    | pino multistream → `getLogStreams()`                                            |
| **Edge Logger**     | `src/core/logger/edge.ts`     | Edge    | pino `browser` mode → `console.*` + HTTP transmit                               |
| **Browser Logger**  | `src/core/logger/browser.ts`  | Browser | pino `browser` mode → `console.*` + HTTP transmit                               |
| **Logflare Logger** | `src/core/logger/logflare.ts` | Node    | pino single write stream (unused in practice — not wired into any runtime path) |

### 2.2 Which Code Uses Which Logger

| Code Path                                            | File                                                                  | Logger Used             | Runtime |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ----------------------- | ------- |
| `with-security.ts`                                   | `src/security/middleware/with-security.ts`                            | `resolveEdgeLogger()`   | Edge    |
| `with-rate-limit.ts`                                 | `src/security/middleware/with-rate-limit.ts`                          | `resolveEdgeLogger()`   | Edge    |
| `with-internal-api-guard.ts`                         | `src/security/middleware/with-internal-api-guard.ts`                  | `resolveEdgeLogger()`   | Edge    |
| `ClerkRequestIdentitySource`                         | `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts` | `resolveServerLogger()` | Node    |
| `with-node-provisioning.ts`                          | `src/security/api/with-node-provisioning.ts`                          | `resolveServerLogger()` | Node    |
| `action-audit.ts`                                    | `src/security/actions/action-audit.ts`                                | `resolveServerLogger()` | Node    |
| `security-logger.ts`                                 | `src/security/utils/security-logger.ts`                               | `resolveServerLogger()` | Node    |
| `with-action-handler.ts`                             | `src/shared/lib/api/with-action-handler.ts`                           | `resolveServerLogger()` | Node    |
| `with-error-handler.ts`                              | `src/shared/lib/api/with-error-handler.ts`                            | `resolveServerLogger()` | Node    |
| API routes (`/api/users`, `/api/security-test/ssrf`) | `src/app/api/*/route.ts`                                              | `resolveServerLogger()` | Node    |
| `/api/logs` route (ingest)                           | `src/app/api/logs/route.ts`                                           | `resolveServerLogger()` | Node    |
| Client components                                    | via `src/core/logger/client.ts`                                       | `getBrowserLogger()`    | Browser |

### 2.3 Stream/Sink Wiring — Server Logger

`getLogStreams()` in `src/core/logger/streams.ts` assembles streams:

```
isDev=true:
  → createConsoleStream()   = pino-pretty → stdout (terminal) ✅
  → createFileStream()      = pino.destination → logs/server.log  [only if LOG_TO_FILE_DEV=true]
  → createLogflareWriteStream() = pino-logflare write stream      [only if LOGFLARE_SERVER_ENABLED=true AND NOT isPreview/isProduction]

isProduction (VERCEL_ENV=production or preview):
  → no console stream
  → no file stream (LOG_TO_FILE_PROD defaults false)
  → createLogflareWriteStream() → returns null (BLOCKED by guard in utils.ts lines 65–83)
```

**Critical**: `createLogflareWriteStream()` in `src/core/logger/utils.ts` contains an explicit early-exit guard:

```typescript
const isPreview = process.env.VERCEL_ENV === 'preview';
const isProduction = process.env.VERCEL_ENV === 'production';

if (isPreview || isProduction) {
  console.info('Logflare stream disabled in', ...);
  return null;   // <-- Logflare is NEVER reached in Vercel production
}
```

This means in Vercel production: **no file sink, no Logflare sink — server logs go to stdout only**, which Vercel captures in its own log drain.

### 2.4 Stream/Sink Wiring — Edge Logger

`getEdgeLogger()` in `src/core/logger/edge.ts` uses pino `browser` mode:

```
browser: {
  asObject: true,
  transmit: (isServer && LOGFLARE_EDGE_ENABLED && NEXT_PUBLIC_APP_URL)
    ? createLogflareEdgeTransport().transmit
    : undefined
}
```

In pino `browser` mode, **all log output goes through `console.*` — there are no file or write-stream sinks**. The transmit sends a fire-and-forget async `fetch` to `/api/logs`.

Current `.env.local` has `LOGFLARE_EDGE_ENABLED=true` and `NEXT_PUBLIC_APP_URL=http://localhost:3000`, so the transmit IS wired locally.

### 2.5 The `/api/logs` Ingest Route — Metadata Stripping

When edge logs are transmitted to `/api/logs`, the route handler at `src/app/api/logs/route.ts` runs `sanitizeContext()` which **actively strips** the fields that identify log origin:

```typescript
const RESERVED_TOP_LEVEL_FIELDS = new Set([
  'type',
  'category',
  'module',
  'source', // 'source' is re-added by the route but overridden
]);

// depth === 0 && RESERVED_TOP_LEVEL_FIELDS.has(key) → skip
```

The child logger bindings from the edge logger — `{ type: 'Security', category: 'middleware', module: 'with-security' }` — arrive in `logEvent.bindings` and are merged into `context` by `buildClientLogPayload`. Then `sanitizeContext` removes them.

The route then re-logs with:

```typescript
resolveServerLogger().child({
  type: 'browser-ingest', // <-- overwrites original type
  category: source, // <-- 'edge', not 'middleware'
  module: 'log-ingest-route',
  source,
});
```

So even when edge transmission succeeds, **the original `type="Security"` identity is destroyed at the ingest boundary**.

---

## 3. Runtime Boundary Assessment

### 3.1 Actual Current Sink Topology (Dev — `.env.local` as configured)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  RUNTIME          LOGGER           SINKS (in dev, current config)               │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Edge / proxy.ts  Edge Logger      → terminal (console.*)          ✅            │
│                                   → /api/logs [HTTP transmit]     ✅ (if enabled)│
│                                   → server.log                    ✗ (indirect)  │
│                                   → Logflare                      ✗ (indirect)  │
│                                                                                  │
│  /api/logs route  Server Logger    → terminal (pino-pretty)        ✅            │
│  (re-ingest)                      → server.log                    ✅            │
│                                   → Logflare write stream         ✅ (if enabled)│
│                                   METADATA: type='browser-ingest' ⚠️ OVERWRITTEN │
│                                                                                  │
│  Node API routes  Server Logger    → terminal (pino-pretty)        ✅            │
│  Server Actions                   → server.log                    ✅            │
│  Auth/Provisioning                → Logflare write stream         ✅ (if enabled)│
│                                   METADATA: type='API', category='auth' ✅       │
│                                                                                  │
│  Browser client   Browser Logger  → browser console               ✅            │
│                                   → /api/logs [sendBeacon/fetch]  ✅ (if enabled)│
│                                   → terminal via re-ingest        ✅            │
│                                   → server.log via re-ingest      ✅            │
│                                   METADATA: type='browser-ingest' ⚠️ OVERWRITTEN │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Why `type="Security"` Logs Are in Terminal But Not `server.log`

**Root cause: The edge logger has no file sink.**

The edge logger uses pino `browser` mode. This mode routes all output through `console.*`. There is no pino write stream, no `destination()`, no file sink. The edge logger cannot write to `server.log` directly — it is not architecturally capable of it.

For edge logs to reach `server.log`, they must travel:

> edge logger → `transmit.send()` → async fetch `/api/logs` → server logger → `server.log`

This path works technically, but produces entries with `type='browser-ingest'` not `type='Security'`, because the ingest route overwrites the metadata.

**Rate limiting is an additional risk**: `/api/logs` is rate-limited at 60 requests per 60 seconds. Every matching HTTP request in development fires a `with-security` debug log. Under moderate dev traffic this saturates the ingest limit and logs are silently dropped (429 is returned but the edge transmit uses `void fetch()`).

### 3.3 Why `type="API"` Logs Are in `server.log`

API-type logs (`ClerkRequestIdentitySource`, `with-node-provisioning`, route handlers) use `resolveServerLogger()` directly. The server logger routes through `getLogStreams()` which includes `createFileStream()` when `LOG_TO_FILE_DEV=true`. These logs bypass the `/api/logs` ingest entirely and write directly to the file sink.

### 3.4 Production (Vercel) Topology — Current State

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  VERCEL_ENV=production                                                          │
├────────────────────────────────────────────────────────────────────────────────┤
│  Server Logger (Node):                                                          │
│    → console/pino-pretty: NO (isDev=false, no console stream)                  │
│    → server.log file: NO (LOG_TO_FILE_PROD=false, Vercel read-only fs anyway)  │
│    → Logflare write stream: NO (createLogflareWriteStream() returns null        │
│      because VERCEL_ENV=production blocks it)                                   │
│    → RESULT: stdout only (Vercel captures in Vercel Log Drain, not Logflare)   │
│                                                                                  │
│  Edge Logger:                                                                   │
│    → console.*: YES (captured by Vercel as edge runtime output)                 │
│    → /api/logs transmit: YES (if LOGFLARE_EDGE_ENABLED=true)                   │
│      → /api/logs server logger → stdout only (Logflare blocked)                │
│    → RESULT: stdout only                                                         │
│                                                                                  │
│  Browser Logger:                                                                 │
│    → /api/logs transmit: YES (if NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED=true)    │
│      → /api/logs server logger → stdout only (Logflare blocked)                │
│    → RESULT: browser console only (no server-side record)                       │
└────────────────────────────────────────────────────────────────────────────────┘
```

**In production: Logflare receives zero logs from any runtime path.** Everything goes to Vercel stdout only.

---

## 4. Docs vs Code Drift

| Claim                                                            | Code Reality                                                                                   | Drift Type                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `LOGFLARE_SERVER_ENABLED=true` enables Logflare in production    | `createLogflareWriteStream()` returns `null` when `VERCEL_ENV=production` regardless of flag   | Config vs behavior mismatch                                          |
| Edge logs are forwarded to Logflare via transmit                 | Transmit reaches `/api/logs` which re-logs with overwritten metadata                           | Silent metadata loss — no docs warning                               |
| `browser-ingest` type in server.log represents browser/edge logs | Original `type`, `category`, `module` are stripped by `RESERVED_TOP_LEVEL_FIELDS` sanitization | Metadata destruction undocumented                                    |
| `LOGFLARE_EDGE_ENABLED=true` sends edge logs to Logflare         | Sends to `/api/logs` → server logger → Logflare blocked in production                          | Flag name implies direct Logflare; actual path is indirect + blocked |

---

## 5. Risks

### CRITICAL

**C1 — Production Logflare blackout**: `createLogflareWriteStream()` unconditionally returns `null` for `VERCEL_ENV=production` and `VERCEL_ENV=preview`. The flag `LOGFLARE_SERVER_ENABLED=true` has no effect in production. All structured log data is lost to Logflare. Only Vercel's own stdout capture is active.

**Files**: `src/core/logger/utils.ts:65-83`

---

### MAJOR

**M1 — Edge log metadata destruction at ingest boundary**: When edge logs transmit to `/api/logs`, `sanitizeContext()` strips `type`, `category`, and `module` fields (they are in `RESERVED_TOP_LEVEL_FIELDS`). The original security classification (`type='Security', category='middleware'`) is permanently lost. The entry appears in `server.log` as `type='browser-ingest'`.

**Files**: `src/app/api/logs/route.ts:48-53`, `src/core/logger/utils.ts` (buildClientLogPayload + sanitizeContext interaction)

**M2 — Rate limiting silently drops edge logs in high traffic**: The `/api/logs` ingest has a 60 req/60s rate limit. Every proxied request fires a `debug` log from `with-security.ts`. Under moderate dev traffic, logs are silently dropped after the limit is reached. The transmit uses `void fetch()` — there is no error visibility.

**Files**: `src/app/api/logs/route.ts:90-100`, `src/core/logger/edge-utils.ts:27-41`

**M3 — `logflare.ts` is dead code**: `src/core/logger/logflare.ts` defines a `getLogflareLogger()` that creates a pino instance with a direct Logflare write stream. This logger is not wired into any runtime path, DI container, or index export. It is unreachable code.

**File**: `src/core/logger/logflare.ts`

**M4 — Undefined production console stream**: In production, the server logger has no console stream (the `isDev || isTest` guard in `streams.ts` omits it). If Logflare and file are also absent (as they are), the logger falls through to `pino(options)` with no streams — which defaults to JSON stdout. This is technically correct for Vercel but it is implicit behavior, not explicit design.

**File**: `src/core/logger/streams.ts:32-42`

---

### MINOR

**m1 — Edge transmit re-ingest rate limit threshold too low for middleware volume**: 60 req/min is calibrated for browser error logs, not for middleware logs that fire on every HTTP request. The limit should be segmented by source type or bypassed for trusted server-side edge transmit.

**m2 — `LOG_INGEST_SECRET` authentication only protects the `source` label**: The ingest secret determines whether the log is labeled as `'edge'` vs `'browser'`. It does not unlock different schema validation, metadata preservation, or rate limit tiers. The design implies privileged edge path but the actual behavior is nearly identical.

---

## 6. Recommended Next Action (Minimum Safe Fix)

The goal stated: **"After deploy, I need to see every type of log in Logflare."**

The minimum necessary changes are, in priority order:

### Step 1 — Remove the production Logflare block (CRITICAL)

In `src/core/logger/utils.ts`, remove or condition the `isPreview || isProduction` guard:

```typescript
// BEFORE (blocks Logflare in Vercel)
if (isPreview || isProduction) {
  return null;
}

// AFTER (allow when LOGFLARE_SERVER_ENABLED=true regardless of env)
// Remove the block. Let env flag control it.
```

This unblocks the server logger's Logflare write stream in Vercel production, enabling all Node-runtime logs (`type='API'`, `type='Security'` from server actions, etc.) to reach Logflare.

**Blast radius**: low — only changes when Logflare stream is created. No behavioral change for environments where `LOGFLARE_SERVER_ENABLED=false`.

---

### Step 2 — Preserve edge log metadata through the ingest boundary (MAJOR)

The `/api/logs` route must not strip `type`, `category`, and `module` when the source is authenticated edge (i.e., `LOG_INGEST_SECRET` matches). Two options:

**Option A (minimal)**: Remove `type`, `category`, `module` from `RESERVED_TOP_LEVEL_FIELDS` for edge sources, and pass them through to the server logger as child bindings instead of overwriting with `'browser-ingest'`.

**Option B (clean)**: Create a separate ingest path for trusted edge logs (`/api/logs/edge`) that preserves metadata verbatim, and keep `/api/logs` as the untrusted browser ingest with full sanitization.

Option A is lower blast radius. Option B is architecturally cleaner and should be the target design.

---

### Step 3 — Raise or bypass the ingest rate limit for edge transmit (MAJOR)

The edge transmit fires on every proxied request. The 60 req/60s limit is designed for browsers, not middleware. Add a separate, higher limit tier for requests presenting the `x-log-ingest-secret`, or implement sampling at the edge transmit level to reduce volume before it hits the rate limiter.

---

### Step 4 — Remove the dead `logflare.ts` logger (MINOR, optional)

`src/core/logger/logflare.ts` is unused. Either wire it into the DI container as an explicit Logflare-only sink path, or delete it to avoid confusion.

---

### Summary Table

| Gap                                   | Fix                                             | Blast Radius |
| ------------------------------------- | ----------------------------------------------- | ------------ | ------------------- | --- |
| Logflare blocked in Vercel production | Remove `isPreview                               |              | isProduction` guard | Low |
| Edge log metadata destroyed at ingest | Preserve metadata for authenticated edge source | Low–Medium   |
| Rate limit drops edge logs silently   | Raise/bypass limit for trusted edge path        | Low          |
| Dead `logflare.ts` code               | Delete or wire it                               | Minimal      |

---

## 7. Target Production Topology (After Fixes)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  VERCEL_ENV=production (target state)                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Node / Server Logger (API routes, server actions, security events):            │
│    → stdout (Vercel log drain)                                  ✅              │
│    → Logflare write stream (pino-logflare)                      ✅              │
│    METADATA: type, category, module preserved                   ✅              │
│                                                                                  │
│  Edge Logger (proxy.ts, with-security, with-rate-limit):                        │
│    → stdout (Vercel edge log output)                            ✅              │
│    → /api/logs transmit → server logger → Logflare              ✅              │
│    METADATA: type='Security', category='middleware' preserved   ✅ (after M1)   │
│                                                                                  │
│  Browser Logger (client components):                                             │
│    → browser console                                            ✅              │
│    → /api/logs transmit → server logger → Logflare              ✅              │
│    METADATA: type='browser-ingest', category='browser'          ✅ (acceptable) │
└─────────────────────────────────────────────────────────────────────────────────┘
```
