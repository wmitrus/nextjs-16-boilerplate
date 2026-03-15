# Logging Sink Remediation — Implementation Report

**Date**: 2026-03-15  
**Agent**: Implementation Agent  
**Status**: IMPLEMENTED  
**Input**: `remediation-plan.md`

---

## 1. Objective

Implemented the four approved logging sink fixes:

1. Deleted dead `logflare.ts` + `logflare.test.ts`
2. Removed the production/preview Logflare block in `utils.ts`
3. Added trusted edge path to `/api/logs` route — metadata preserved, rate limit bypassed
4. Updated `route.test.ts` and `utils.test.ts` with correct coverage

---

## 2. Affected Files / Modules

| File                               | Layer                | Change                               |
| ---------------------------------- | -------------------- | ------------------------------------ |
| `src/core/logger/logflare.ts`      | `core/logger`        | **Deleted**                          |
| `src/core/logger/logflare.test.ts` | `core/logger`        | **Deleted**                          |
| `src/core/logger/utils.ts`         | `core/logger`        | Modified — removed guard             |
| `src/core/logger/utils.test.ts`    | `core/logger`        | Modified — updated test expectations |
| `src/app/api/logs/route.ts`        | `app/api` (delivery) | Modified — trusted edge path         |
| `src/app/api/logs/route.test.ts`   | `app/api` (delivery) | Modified — new test coverage         |

No contracts changed. No DI registrations changed. No new files created. No module boundaries crossed.

---

## 3. Implementation Plan Followed

Changes applied in approved order:

1. Delete dead code (zero external callers confirmed before deletion)
2. Minimal guard removal in `utils.ts`
3. Trusted edge branch in `route.ts` — auth check moved before rate limit, `sanitizeContext` gains `trusted` param, child bindings branch on `isEdge`
4. Test updates for changed behavior

---

## 4. Changes Made

### 4.1 `src/core/logger/logflare.ts` — Deleted

Dead code. `getLogflareLogger()` had zero callers outside its own test file. Confirmed via grep across `src/` before deletion.

### 4.2 `src/core/logger/logflare.test.ts` — Deleted

Only tested `getLogflareLogger()` from the deleted file. No value once the implementation is gone.

### 4.3 `src/core/logger/utils.ts`

**Removed** the `isPreview || isProduction` early-return guard (previously lines 65–66, 78–85):

```typescript
// DELETED:
const isPreview = process.env.VERCEL_ENV === 'preview';
const isProduction = process.env.VERCEL_ENV === 'production';

if (isPreview || isProduction) {
  console.info('Logflare stream disabled in', ...);
  return null;
}
```

The credential check (API key + source token/name) remains intact. The JSDoc comment was updated to remove the now-false claim about production being disabled.

**Effect**: `createLogflareWriteStream()` now creates a stream for any `VERCEL_ENV` when credentials are present. The `LOGFLARE_SERVER_ENABLED` env flag in `streams.ts` is the sole on/off control.

### 4.4 `src/core/logger/utils.test.ts`

Replaced two now-incorrect tests (`should return null in preview environment`, `should return null in production environment`) with tests that verify the correct post-fix behavior (stream IS created in preview and production when credentials are set).

Removed redundant `process.env.VERCEL_ENV = 'development'` lines from the remaining tests (no longer needed since the guard is gone).

### 4.5 `src/app/api/logs/route.ts`

Three behavioral changes, all within the existing single-route design:

**a) Auth check moved before rate limit**

```typescript
// NEW: auth determined first
const ingestSecret = request.headers.get('x-log-ingest-secret');
const isEdge =
  !!env.LOG_INGEST_SECRET && ingestSecret === env.LOG_INGEST_SECRET;

const ip = await getIP(request.headers);

// Rate limit applies only to unauthenticated (browser) requests
if (!isEdge) {
  const rateLimitResult = await checkIngestRateLimit(ip);
  if (!rateLimitResult.success) {
    return new NextResponse(null, { status: 429 });
  }
}
```

**b) `sanitizeContext` gains `trusted` parameter**

```typescript
function sanitizeContext(
  obj: Record<string, unknown>,
  depth = 0,
  trusted = false, // NEW
): Record<string, unknown> {
  // source is always route-controlled regardless of trust
  if (depth === 0 && key === 'source') continue;
  // type/category/module blocked only for untrusted (browser) sources
  if (depth === 0 && !trusted && RESERVED_TOP_LEVEL_FIELDS.has(key)) continue;
  // secret pattern stripping is unconditional — stays regardless of trust
  if (SECRET_KEY_PATTERN.test(key)) continue;
  // ...
  // trusted param now propagated to recursive calls
  result[key] = sanitizeContext(value, depth + 1, trusted);
}
```

**c) Edge/browser branching for child bindings**

```typescript
const sanitizedContext = sanitizeContext(validation.data.context, 0, isEdge);

if (isEdge) {
  // Extract classification fields from context → use as child bindings
  const { type, category, module: mod, ...rest } = sanitizedContext;
  childBindings = {
    type: (type as string | undefined) ?? 'edge-ingest',
    category: (category as string | undefined) ?? 'edge',
    module: (mod as string | undefined) ?? 'log-ingest-route',
    source: 'edge',
  };
  logContext = rest; // classification fields NOT duplicated in log body
} else {
  childBindings = {
    type: 'browser-ingest',
    category: 'browser',
    module: 'log-ingest-route',
    source: 'browser',
  };
  logContext = sanitizedContext; // unchanged browser behavior
}
```

**Security constraints preserved:**

- `SECRET_KEY_PATTERN` stripping is unconditional — applies to both trusted and untrusted
- `source` in context is always blocked — route controls `source` authoritatively
- Trust is established only by `LOG_INGEST_SECRET` header — the payload's `source` field has no effect on trust

### 4.6 `src/app/api/logs/route.test.ts`

Added `mockLocalRateLimit.mockClear()` to `beforeEach` to correctly reset call count between tests.

Added 8 new tests across two new `describe` blocks:

**`edge source authentication` (new tests added to existing describe block):**

- `preserves type/category/module from context for authenticated edge`
- `uses default edge-ingest type when context has no type for authenticated edge`
- `strips type/category/module from log body when used as child bindings for edge`
- `still strips secret-named keys for authenticated edge`
- `source from context is always ignored — route controls it`

**`edge rate limit bypass` (new describe block):**

- `bypasses rate limit for authenticated edge ingest`
- `applies rate limit for unauthenticated requests even with source=edge in payload`

---

## 5. Validation / Verification

All four quality gates passed:

| Check                   | Result                             |
| ----------------------- | ---------------------------------- |
| `pnpm typecheck`        | ✅ 0 errors                        |
| `pnpm lint`             | ✅ 0 warnings                      |
| `pnpm test`             | ✅ 741/741 passed (115 test files) |
| `pnpm skott:check:only` | ✅ No circular dependencies        |
| `pnpm madge`            | ✅ No circular dependency found    |

---

## 6. Risks / Follow-ups

### Resolved by this implementation

- Logflare now receives logs in Vercel production/preview when `LOGFLARE_SERVER_ENABLED=true`
- Edge logs transmitted to `/api/logs` now preserve `type='Security'`, `category='middleware'`, `module='with-security'`
- Authenticated edge ingest no longer blocked by the browser-calibrated rate limit

### Residual risks (noted in remediation-plan.md, out of scope for this pass)

- **Edge log volume in production**: Every non-static request fires a debug log from `with-security`. With `LOGFLARE_EDGE_ENABLED=true` and `LOG_LEVEL=debug`, this generates high `/api/logs` volume. Mitigation: set `LOG_LEVEL=warn` in Vercel production environment.
- **Production console stream is implicit**: In production (no `isDev`, no `isTest`), `streams.ts` adds no console stream. `pino` defaults to stdout JSON. This is correct for Vercel but implicit, not explicit by design.
- **`pino-logflare` API stability**: Uses `createWriteStream` with `sourceToken`/`sourceName`. Worth monitoring if Logflare API changes.
