# Runtime Behavior Review

**Task ID**: 43 (Leantime)
**Step**: Runtime Behavior Review (Next.js Runtime Agent)
**Date**: 2026-04-12
**Status**: complete

---

## Runtime Placement Analysis

### Current Instrumentation Placement

| File                                                  | Runtime                                     | Concern                                               |
| ----------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `src/instrumentation.ts`                              | `nodejs` only (`NEXT_RUNTIME === 'nodejs'`) | Correct — NR agent is Node-only                       |
| `src/monitoring/server-init.ts`                       | Server-only (imported from instrumentation) | Correct                                               |
| `src/core/observability/new-relic.ts`                 | Server-only (marked `server-only`)          | Correct                                               |
| `src/app/observability/new-relic-browser.js/route.ts` | Route handler (Node)                        | Correct — uses `await connection()`                   |
| `src/app/layout.tsx`                                  | RSC layout                                  | Correct — `isNewRelicEnabled` check before `<Script>` |

### `cacheComponents: true` Constraint Check

The repo runs with `cacheComponents: true` in `next.config.ts`. This bans `export const dynamic` and `export const runtime` in route segments. The NR browser route uses `await connection()` (correct). No route segment configs found in NR files. ✅

### `await connection()` Compliance

`src/app/observability/new-relic-browser.js/route.ts` correctly calls `await connection()` before any request-time work. The `getBrowserTimingHeaderSafe()` function is only called after this opt-in. ✅

### Edge Runtime Exclusion

`src/instrumentation.ts` gates the NR agent load under `NEXT_RUNTIME === 'nodejs'`. The `new-relic.ts` facade is tagged `server-only`. No Edge runtime violation. ✅

---

## The Core Problem: `instrumentation.ts` Late Load

Next.js `instrumentation.ts` `register()` hook runs at the start of the server lifecycle, but **after** the Node.js HTTP module is already initialized by the Next.js framework. The `newrelic` npm agent requires it be the **very first require** in the process to instrument Node.js `http` and `https` before any other code runs. This is by design in the NR agent.

When loaded via `instrumentation.ts`:

- Next.js HTTP patches are already active
- NR agent cannot patch `http.createServer` et al.
- `collector.isConnected()` may still become true (~1-3 seconds after cold start for the OTLP/collector handshake)
- However, transactions are likely **not** properly captured because the HTTP layer wasn't instrumented at the correct time

On Vercel:

- Functions are serverless — each invocation may be a cold start
- The ~1-3 second connection delay means the first (and often only) request before Lambda timeout may arrive before `isConnected()` is true
- This explains why `tx=false` and `appId=false` appear in logs

---

## Official Vercel Integration Runtime Characteristics

The **Vercel Log Drain** approach operates entirely outside Next.js/Node.js:

- Vercel infrastructure captures `stdout`/`stderr` from function invocations
- Sends logs via HTTP POST to New Relic Logs API at `https://log-api.newrelic.com/log/v1`
- No code changes to Next.js routes or instrumentation needed
- The `pino` logger in this repo already writes to `stdout` (via `PINO_LOG_DEST=stdout` or default)
- Log drain runs even on cold starts, before any Node.js code runs

**OpenTelemetry Traces (Beta)**:

- Vercel's OTel integration injects the OTel SDK into function runtime automatically
- Traces are exported to New Relic's OTLP endpoint (`https://otlp.nr-data.net`)
- This does NOT require `newrelic` npm package
- The OTel traces differ from NR APM traces in format (spans vs transactions)

---

## Logging Infrastructure Compatibility

The repository uses `pino` for structured logging. Key compatibility facts:

1. `newrelic.js` has `logging: { level: 'info', filepath: 'stdout' }` — NR agent logs to stdout ✅
2. Pino logs structured JSON to stdout — compatible with NR log drain ingestion ✅
3. NR Logs can parse JSON objects from Vercel log drain payloads ✅
4. Log drain will capture ALL stdout output including Next.js framework messages ✅

---

## Browser Monitoring Runtime Impact

The NR browser monitoring path (`/observability/new-relic-browser.js`) is fundamentally coupled to the APM agent being connected:

```text
getBrowserTimingHeaderSafe()
  → nr.agent?.collector?.isConnected()  // APM agent must be connected
  → nr.getBrowserTimingHeader()          // APM must have application context
```

If the APM agent is removed or not connected, this returns `''` always.

**Alternative for browser monitoring if APM agent is dropped**:

- NR Browser standalone agent (separate npm package or CDN snippet)
- This requires a New Relic Browser license key (separate from APM key on New Relic free plan)
- Can be injected via `<Script>` directly in `layout.tsx` with a static snippet
- Does NOT suffer from the APM connection timing issue
- However, introduces the snippet size problem if using the full SPA agent (~88KB inline)

---

## Caching Behavior

The NR browser route already uses `Cache-Control: no-store`. The log drain operates outside Next.js caching entirely. No caching concerns. ✅

---

## Runtime Summary

| Concern                                  | Finding                               | Risk                                       |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------ |
| `await connection()` usage               | Correct                               | None                                       |
| `cacheComponents: true` compliance       | Compliant                             | None                                       |
| Edge runtime exclusion                   | Properly excluded                     | None                                       |
| APM agent late load (instrumentation.ts) | Root cause of broken APM on Vercel    | HIGH                                       |
| Pino stdout logging                      | Compatible with log drain             | None                                       |
| Browser monitoring APM dependency        | Will break if APM dropped             | HIGH — needs alternative                   |
| Log drain runtime placement              | Outside Next.js — no runtime concerns | None                                       |
| OTel Beta                                | Beta quality — no production SLA      | MEDIUM risk if used for critical telemetry |

---

## Recommendation (Runtime Perspective)

The runtime constraints do not block implementing the Vercel log drain integration. The primary risks are:

1. **Browser monitoring**: Needs a decision — APM-linked delivery is broken; standalone NR Browser agent is an alternative but has the snippet size problem for inline delivery
2. **OTel Beta**: Acceptable for traces in a boilerplate context, but should be labeled as beta/experimental
3. **APM traces**: Cannot be reliably achieved via `instrumentation.ts` on Vercel without a different bootstrap mechanism
