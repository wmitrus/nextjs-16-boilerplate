# Architecture Impact Review

**Task ID**: 43 (Leantime)
**Step**: Architecture Impact Review (Architecture Guard Agent)
**Date**: 2026-04-12
**Status**: complete

---

## Module Boundary Assessment

### Affected Module Ownership

| Module             | Path                                                  | Current NR Usage                              |
| ------------------ | ----------------------------------------------------- | --------------------------------------------- |
| Core (contracts)   | `src/core/observability/new-relic.ts`                 | APM facade: spans, attributes, browser header |
| Monitoring (infra) | `src/monitoring/server-init.ts`                       | Server bootstrap init                         |
| App (delivery)     | `src/app/observability/new-relic-browser.js/route.ts` | Browser script delivery                       |
| App (delivery)     | `src/app/layout.tsx`                                  | `<Script>` injection point                    |
| Core (env)         | `src/core/env.ts`                                     | `NEW_RELIC_*` env schema                      |
| Bootstrap          | `src/instrumentation.ts`                              | NR agent load registration                    |

### Dependency Direction

Current dependency flow is correct:

- `app → core/observability` (via route handler) ✅
- `core/runtime/bootstrap → core/observability/new-relic` (NR spans) ✅
- No features or shared layer imports `newrelic` directly ✅
- No business logic coupled to NR ✅

This architecture is **preserved** by the log drain approach since it doesn't change code — it adds a Vercel-side integration.

---

## Architecture Impact by Scenario

### Scenario A: Log Drain Only (Minimum Change)

**What changes**:

- External: Vercel integration configured in Vercel dashboard + NR UI
- Repository: Potentially add `NEW_RELIC_LOG_DRAIN_ENABLED` env var and documentation update
- No code changes to Next.js source

**Architecture impact**: **None** — Vercel handles log drain outside the application boundary. The existing `pino` stdout logging is already compatible.

**DI container impact**: None. ✅

---

### Scenario B: Log Drain + OpenTelemetry Traces (Beta)

**What changes**:

- External: OTel toggle in Vercel integration UI
- Repository: May need OTel SDK package (`@opentelemetry/*`) if custom instrumentation desired
- The basic OTel injection from Vercel requires no repo code changes

**Architecture impact**:

- If only Vercel's automatic OTel injection is used: **None** (zero code changes)
- If custom OTel spans are added: new provider dependency — must be isolated behind `src/core/observability/` facade, never spread across features

**DI container impact**: None for automatic OTel. ✅

---

### Scenario C: Remove or De-emphasize APM Agent

**What changes**:

- `src/instrumentation.ts` — remove or guard NR agent load with `VERCEL_ENV` check
- `src/monitoring/server-init.ts` — simplify or make conditional
- `src/core/observability/new-relic.ts` — `withContainerCreationSpan()` and `recordContainerCreated()` would no-op safely (existing null guards)
- `src/app/observability/new-relic-browser.js/route.ts` — always returns empty on Vercel (already the case)

**Architecture impact**: **Low** — existing null guards in `new-relic.ts` facade mean callers (e.g., `bootstrap.ts`) already handle the no-op case. No cascade changes required.

**Risk**: `recordContainerCreated()` spans disappear from NR APM. If APM tracing was a design goal, this is a demotion. If log-based observability is sufficient, this is acceptable.

---

### Scenario D: Add NR Browser Standalone Agent

**What changes**:

- `src/app/layout.tsx` — change `<Script src="/observability/new-relic-browser.js">` to either:
  - A CDN-loaded NR Browser agent (requires CSP update)
  - A static snippet inlined (snippet size problem: ~88KB)
  - A route that serves the NR Browser npm agent (separate from APM agent)
- `src/core/observability/new-relic.ts` — `getBrowserTimingHeaderSafe()` becomes unused
- New env vars: `NEW_RELIC_BROWSER_LICENSE_KEY` (browser-specific key, different from APM)

**Architecture impact**: **Medium** — new provider concern in delivery layer. Must remain isolated in `src/core/observability/` or a new `src/core/observability/new-relic-browser.ts` facade.

**CSP impact**: `src/security/middleware/with-headers.ts` may need updating if CDN URL changes. Current CSP already allows NR beacon domains.

---

## Architecture Non-Negotiables

These must not be violated regardless of approach chosen:

1. ✅ **Keep NR agent isolation in `src/core/observability/`** — no direct `newrelic` imports in features, shared, or modules
2. ✅ **Keep browser delivery request-time** — no `Date.now()` in prerendered layouts (already handled)
3. ✅ **Keep env schema in `src/core/env.ts`** — any new `NEW_RELIC_*` or `VERCEL_*` vars must go through T3-Env
4. ✅ **Keep CSP update in `src/security/middleware/with-headers.ts`** — any new NR domains
5. ✅ **Maintain `logging: { filepath: 'stdout' }` in `newrelic.js`** — prevents EROFS on Vercel

---

## Architecture Readiness Assessment

| Approach                   | Module Boundary Risk | DI Risk | Blast Radius            | Recommendation        |
| -------------------------- | -------------------- | ------- | ----------------------- | --------------------- |
| Log drain only             | None                 | None    | None                    | ✅ Safe to proceed    |
| Log drain + OTel (auto)    | None                 | None    | None                    | ✅ Safe to proceed    |
| Remove APM agent on Vercel | Low                  | None    | Low (null guards exist) | ✅ Safe with guards   |
| NR Browser standalone      | Medium               | None    | Medium (new provider)   | ⚠️ Needs task scoping |

---

## Open Architecture Questions

1. Should `withContainerCreationSpan()` and `recordContainerCreated()` be kept as no-ops if APM is removed on Vercel, or should they be adapted to emit OTel spans?
2. Should the `new-relic-browser.js` route be deprecated/removed if browser monitoring switches to standalone agent?
3. Should OTel instrumentation (if added) share the same `src/core/observability/` facade or get a sibling `src/core/observability/opentelemetry.ts`?

These are design decisions that should be resolved before implementation if Scenario C or D is chosen.
