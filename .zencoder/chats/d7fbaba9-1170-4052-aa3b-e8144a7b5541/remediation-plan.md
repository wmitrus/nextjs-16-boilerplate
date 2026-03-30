# Logging Sink Remediation Plan

**Date**: 2026-03-15  
**Agent**: Architecture Guard Agent  
**Scope**: Minimum safe fix to restore Logflare visibility across all log classes in development and Vercel production  
**Input**: `logging-sink-topology.md` findings  
**Status**: Pre-implementation approval

---

## 1. Objective

Define the architecturally approved, minimum-blast-radius remediation shape for the four logging topology gaps identified in the topology investigation. Approve what must be changed, specify what must not be done, and constrain the implementation scope.

---

## 2. Current-State Summary

Four structural problems, in priority order:

| #   | Problem                                                                                                                                         | Severity | Root Location                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- |
| C1  | `createLogflareWriteStream()` returns `null` for `VERCEL_ENV=production/preview` regardless of `LOGFLARE_SERVER_ENABLED` flag                   | CRITICAL | `src/core/logger/utils.ts:65-83`    |
| M1  | `sanitizeContext()` strips `type`, `category`, `module` from all ingest payloads — including authenticated edge — destroying log identity       | MAJOR    | `src/app/api/logs/route.ts:60-68`   |
| M2  | Rate limit (60 req/60s, keyed by IP) applies equally to browser and edge ingest. Edge fires per-request from proxy; saturates limit silently    | MAJOR    | `src/app/api/logs/route.ts:103-109` |
| M3  | `src/core/logger/logflare.ts` (`getLogflareLogger`) is dead code — not wired into any DI path, not exported from index, not referenced anywhere | MAJOR    | `src/core/logger/logflare.ts`       |

---

## 3. Architectural Decisions

### 3.1 Fix C1 — Remove the Logflare production block

**Decision: APPROVED — remove the `isPreview || isProduction` guard.**

Rationale:

- The `LOGFLARE_SERVER_ENABLED` env flag is the correct control mechanism. The flag-check in `streams.ts:40` already gates creation. The additional guard in `utils.ts:78-83` makes `LOGFLARE_SERVER_ENABLED=true` a dead flag in production, contradicting the design contract implied by the env schema.
- The comment in `utils.ts` says "Disables Logflare in preview/production to avoid connection issues." This is an unverified assumption — pino-logflare writes to the Logflare HTTP API which is available in any environment. There is no technical reason to block it.
- Vercel production is precisely the environment where external structured log sinks are critical. Stdout-only logging in Vercel requires using Vercel's own log drain, which is a separate concern not a substitute for Logflare.

**Approved change:**

Remove lines 65–83 from `src/core/logger/utils.ts`:

```typescript
// DELETE these lines:
const isPreview = process.env.VERCEL_ENV === 'preview';
const isProduction = process.env.VERCEL_ENV === 'production';

if (isPreview || isProduction) {
  console.info(
    'Logflare stream disabled in',
    isPreview ? 'preview' : 'production',
    'environment',
  );
  return null;
}
```

The credential check (lines before the guard) must be retained — Logflare should still fail gracefully if `LOGFLARE_API_KEY` or `LOGFLARE_SOURCE_TOKEN` is absent.

**Blast radius:** One file, three-line deletion. No behavioral change when `LOGFLARE_SERVER_ENABLED=false`. No new dependencies.

---

### 3.2 Fix M1 — Preserve edge log metadata through the ingest boundary

**Decision: APPROVED — in-route trusted branch, NOT a new route.**

The choice between Option A (in-route branching) and Option B (separate `/api/logs/edge` route) was evaluated:

**Option B (separate route) is rejected for this remediation** for the following architectural reasons:

- Would require a new `src/app/api/logs/edge/route.ts` App Router segment.
- Would require changing the edge transmit URL in `src/core/logger/edge-utils.ts`.
- Would require updating `NEXT_PUBLIC_APP_URL`-based URL construction or adding a new env var.
- Would increase blast radius across three files and a new App Router segment.
- The trust boundary is already correctly established via `LOG_INGEST_SECRET` inside the existing route. Splitting into two routes duplicates the authentication concern rather than using the existing one.

**Option A (in-route trusted branch) is approved** as the minimum safe shape:

The `sanitizeContext()` function must accept a `trusted: boolean` parameter. When `trusted=true`:

- **Preserve** `type`, `category`, `module` fields from the payload context.
- **Continue stripping** `SECRET_KEY_PATTERN` fields regardless of trust level — this is security-essential and must remain unconditional.
- **Continue stripping** `source` — the route controls `source` authoritatively; clients should not override it.

The child logger call must change when `isEdge=true`:

- Extract `type`, `category`, `module` from the trusted context (if present).
- Pass them through as child bindings.
- Do **not** hardcode `type: 'browser-ingest'` for edge sources.

**Approved shape for `route.ts`:**

```typescript
// sanitizeContext gains a trusted param
function sanitizeContext(
  obj: Record<string, unknown>,
  depth = 0,
  trusted = false, // ADD
): Record<string, unknown> {
  // ...
  for (const [key, value] of Object.entries(obj)) {
    // When trusted: allow type/category/module through; still block 'source'
    if (depth === 0 && !trusted && RESERVED_TOP_LEVEL_FIELDS.has(key)) continue;
    if (depth === 0 && trusted && key === 'source') continue; // source is always route-controlled
    if (SECRET_KEY_PATTERN.test(key)) continue; // unconditional
    // ...
  }
}

// POST handler: branch on isEdge
const sanitizedContext = sanitizeContext(validation.data.context, 0, isEdge);

const childBindings = isEdge
  ? {
      type: (sanitizedContext['type'] as string | undefined) ?? 'edge-ingest',
      category: (sanitizedContext['category'] as string | undefined) ?? 'edge',
      module:
        (sanitizedContext['module'] as string | undefined) ??
        'log-ingest-route',
      source: 'edge',
    }
  : {
      type: 'browser-ingest',
      category: 'browser',
      module: 'log-ingest-route',
      source: 'browser',
    };

const logger = resolveServerLogger().child(childBindings);

// Strip the classification fields from the body to avoid duplication in the log entry
const { type: _t, category: _c, module: _m, ...restContext } = sanitizedContext;
const logContext = isEdge ? restContext : sanitizedContext;

logger[level]({ ...logContext, ip }, validation.data.message);
```

**Security constraints that must not be violated:**

- `SECRET_KEY_PATTERN` stripping is unconditional. Password, token, secret, auth fields are stripped regardless of trust level.
- `source` field in context is ignored — the route assigns it authoritatively from `isEdge`.
- Trust is established only by `LOG_INGEST_SECRET` header match — never by payload `source` field.

**Blast radius:** One file (`route.ts`). One new parameter to `sanitizeContext`. Existing tests for browser ingest remain valid. New tests required for edge metadata path.

---

### 3.3 Fix M2 — Rate limiting for authenticated edge ingest

**Decision: APPROVED — bypass rate limit for authenticated edge requests.**

Rationale for bypassing rather than raising the limit:

- Edge ingest is authenticated by `LOG_INGEST_SECRET`. It is server-internal — not user-originated traffic.
- Rate limiting server-internal calls by IP is meaningless: in Vercel, all edge function invocations share the same or overlapping internal IPs. The limit would be saturated by the server itself within seconds.
- The rate limit exists to protect the ingest route from untrusted browser abuse. It is a browser-facing protection, not an internal-call protection.
- Bypassing for authenticated edge preserves the browser protection while removing the self-imposed blocking behavior.

**Approved change in `route.ts`:**

```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Authenticate edge before rate limiting — trusted edge bypasses IP rate limit
  const ingestSecret = request.headers.get('x-log-ingest-secret');
  const isEdge = !!env.LOG_INGEST_SECRET && ingestSecret === env.LOG_INGEST_SECRET;

  if (!isEdge) {
    const ip = await getIP(request.headers);
    const rateLimitResult = await checkIngestRateLimit(ip);
    if (!rateLimitResult.success) {
      return new NextResponse(null, { status: 429 });
    }
  }
  // ... rest of handler
```

Note: this requires moving the `ingestSecret`/`isEdge` determination to before the rate limit check, which is a minor reordering. The authentication check itself is moved earlier — it does not change trust semantics.

**What is NOT approved:**

- Do not add a separate rate limit key or Upstash entry for edge ingest. There is no value in rate limiting a trusted internal path — complexity without benefit.
- Do not add a new env var to configure edge rate limits. The bypass approach is simpler and correct.
- Do not add log sampling at the edge transmit level for this remediation. Log level filtering via `LOGFLARE_EDGE_ENABLED` and `LOG_LEVEL` already controls edge transmit volume. Sampling adds complexity and belongs in a future dedicated observability configuration.

**Blast radius:** Minor reordering in `route.ts`. No new dependencies, no new env vars, no schema changes.

---

### 3.4 Fix M3 — Delete `src/core/logger/logflare.ts`

**Decision: APPROVED — delete the file.**

Rationale:

- `getLogflareLogger()` is confirmed dead code: zero callers outside the file itself (verified via grep across `src/`).
- It is not exported from `src/core/logger/index.ts`.
- It is not registered in any DI container.
- The server logger already covers the Logflare sink via `createLogflareWriteStream()` inside `getLogStreams()`. A separate `getLogflareLogger()` that also calls `createLogflareWriteStream()` would create two competing Logflare write streams if ever wired in — double-logging everything.
- There is no valid future use case for a standalone Logflare-only logger that bypasses the multistream design.

**Blast radius:** Delete one file. Confirm no imports exist (already verified — none found). No test file for `logflare.ts` to remove separately (confirmed: no `logflare.test.ts` in the logger directory other than `logflare.test.ts` which tests the stream creation function in `utils.ts`).

> **Note**: Check if `src/core/logger/logflare.test.ts` tests `getLogflareLogger`. If so, delete that test file too. If it tests `createLogflareWriteStream` (which lives in `utils.ts`), it must be kept and its import corrected.

---

## 4. Forbidden Implementation Patterns

The following must not appear in the implementation, regardless of apparent convenience:

| Pattern                                                                                          | Reason                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Moving `sanitizeContext` into `src/core/logger/`                                                 | Creates dependency from `core` on delivery-layer ingest concerns. Delivery layer owns its own input sanitization.                  |
| Creating `/api/logs/edge` as a separate App Router segment                                       | Increases blast radius without architectural benefit. Trust is already established in the existing route.                          |
| Wiring `getLogflareLogger()` into DI as `LOGGER.LOGFLARE`                                        | Would create a third logger competing with the server logger's own Logflare stream, causing double-logging.                        |
| Removing `SECRET_KEY_PATTERN` filtering for trusted edge                                         | Secret stripping is unconditional. Trusted edge origin does not mean trusted payload content.                                      |
| Letting payload `source` field determine trust level                                             | Trust is exclusively established by `LOG_INGEST_SECRET` header. The payload `source` field is untrusted input.                     |
| Adding a new `LOGGER.EDGE_INGEST` symbol to contracts                                            | Unnecessary abstraction — the ingest route uses the server logger directly, which is correct.                                      |
| Changing the edge transmit to skip `/api/logs` entirely and write directly to Logflare from edge | Would expose `LOGFLARE_API_KEY` via `NEXT_PUBLIC_*` or require server-side rendering assumptions in edge context. Neither is safe. |
| Adding log sampling middleware at the proxy/edge level                                           | Out of scope. Risk of hiding production logs. Belongs in a future observability configuration sprint.                              |
| Modifying `clientLogSchema` to add trusted fields to the Zod schema                              | The schema validates untrusted browser input. Trusted edge metadata comes from bindings, not schema fields.                        |

---

## 5. Affected Files

| File                             | Change Type | Change Description                                                                                                                                                          |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------- |
| `src/core/logger/utils.ts`       | Modify      | Remove `isPreview                                                                                                                                                           |     | isProduction` guard (3 lines deleted) |
| `src/core/logger/logflare.ts`    | Delete      | Dead code removal                                                                                                                                                           |
| `src/app/api/logs/route.ts`      | Modify      | Add `trusted` param to `sanitizeContext`; add `isEdge` branching for child bindings; move auth check before rate limit; bypass rate limit for trusted edge                  |
| `src/app/api/logs/route.test.ts` | Modify      | Add tests for: (a) edge metadata preserved when secret matches, (b) edge rate limit bypass, (c) `type`/`category`/`module` from trusted context appear in logger child call |

No new files. No new env vars. No new DI registrations. No new contracts.

---

## 6. Minimum Safe Implementation Scope

This remediation is intentionally scoped to **four changes in three files** (plus one file deletion). It does not redesign the logging system. It does not introduce new abstractions. It does not change the architecture of the sink topology.

The minimum safe scope corrects three concrete bugs and removes one piece of dead code:

1. **`utils.ts`**: Remove 3 lines. Logflare write stream becomes available in Vercel production.
2. **`route.ts`**: Add `trusted` param to `sanitizeContext`, add early auth before rate limit, add `isEdge` branch for child bindings. Edge log identity is preserved.
3. **`logflare.ts`**: Delete file. No more confusion about dead Logflare path.
4. **`route.test.ts`**: Add coverage for the new edge trusted path behavior.

**After these changes, the production topology becomes:**

```
Node (API routes, server actions, security events, /api/logs re-ingest):
  → stdout                               ✅  (Vercel captures)
  → Logflare write stream                ✅  (unblocked)
  METADATA: type/category/module intact  ✅

Edge (proxy.ts, with-security, with-rate-limit):
  → console.*                            ✅  (Vercel edge output)
  → /api/logs transmit → server logger   ✅
  METADATA: type='Security' preserved    ✅  (after M1 fix)
  Rate limit: bypassed for trusted edge  ✅  (after M2 fix)

Browser (client components):
  → browser console                      ✅
  → /api/logs transmit → server logger   ✅
  METADATA: type='browser-ingest'        ✅  (correct for untrusted)
  Rate limit: 60/min by IP              ✅  (unchanged, appropriate)
```

---

## 7. What This Remediation Does NOT Fix

Out of scope for this pass. Track separately:

- **Production console stream absence is implicit** — `streams.ts` falls back to `pino(options)` with no streams in production (stdout is implicit). This is technically correct but should be made explicit with a documentation note or a production console stream that outputs JSON.
- **Edge log sampling** — in production with high traffic, edge logs will still generate high `/api/logs` volume. The rate limit bypass removes the blocking but does not control volume. Log level filtering via `LOG_LEVEL` is the current control. Consider restricting `LOGFLARE_EDGE_ENABLED` to `warn` and above for production via a separate `LOGFLARE_EDGE_LOG_LEVEL` env var in a future iteration.
- **`LOG_INGEST_SECRET` rotation** — the secret has no expiry or rotation mechanism. Not in scope here, but note for future security hardening.
- **`pino-logflare` version and API stability** — `createWriteStream` from `pino-logflare` uses the legacy `LOGFLARE_SOURCE_TOKEN`/`LOGFLARE_SOURCE_NAME` API. This has known version sensitivity. Not a blocker for this fix but worth tracking if Logflare deprecates this API.

---

## 8. Docs vs Code Drift

No architecture documentation was found that documents the intended logging sink topology. The drift is entirely between env variable names/flags and their actual runtime behavior:

| Env var / flag                 | Documented intent                | Actual behavior                                  | Status         |
| ------------------------------ | -------------------------------- | ------------------------------------------------ | -------------- |
| `LOGFLARE_SERVER_ENABLED=true` | Enable Logflare for server logs  | Has no effect in Vercel production               | Fixed by C1    |
| `LOGFLARE_EDGE_ENABLED=true`   | Enable Logflare for edge logs    | Sends to `/api/logs` with metadata destruction   | Fixed by M1    |
| `LOG_INGEST_SECRET`            | Authenticate trusted edge ingest | Sets `source` label only; no metadata privileges | Fixed by M1+M2 |

Post-implementation, these flags will behave as their names imply.

---

## 9. Risks

### Accepted risks

- **Logflare in production costs money if API key is valid and `LOGFLARE_SERVER_ENABLED=true`**: This is the intended behavior. The flag gives operators control.
- **Edge ingest bypasses rate limit**: Accepted because the source is authenticated server-internal code, not public traffic. The bypass does not weaken protection against browser abuse.

### Residual risks (not addressed in this remediation)

- **High volume edge logs under load**: Removing rate limit bypass does not bound volume. In production with many concurrent users, every request to any non-static path fires a debug log from `with-security`. This will generate significant Logflare volume. Mitigation: set `LOG_LEVEL=warn` in Vercel production env and `LOGFLARE_EDGE_ENABLED=true` only at warn-and-above levels.
- **`pino-logflare` write stream blocking on network failure**: The stream is synchronous (`sync: true` for file, but Logflare stream is async). If the Logflare API is down in production, write calls will fail silently via the `stream.on('error')` handler. This is acceptable but should be monitored.

---

## 10. Recommended Implementation Order

1. Delete `src/core/logger/logflare.ts` — zero-risk dead code removal, confirms no hidden callers.
2. Modify `src/core/logger/utils.ts` — removes production block, enables Logflare. Can be verified by checking Logflare ingestion in a Vercel preview deploy.
3. Modify `src/app/api/logs/route.ts` — most complex change; requires careful test coverage.
4. Modify `src/app/api/logs/route.test.ts` — test coverage for the new trusted edge path.
