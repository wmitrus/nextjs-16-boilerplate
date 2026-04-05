# Validation Report — Per-Request DI Container Caching + New Relic

**Task ID**: `2026-04-05-per-request-caching`
**Date**: 2026-04-05
**Status**: ✅ Complete

---

## Summary

The repository now has both the completed implementation and captured validation evidence for the final post-follow-up state.

---

## Gate Results

| Gate                         | Command                                                              | Result                                          |
| ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| TypeScript typecheck         | `pnpm typecheck`                                                     | ✅ 0 errors                                     |
| ESLint (with auto-fix)       | `pnpm lint --fix`                                                    | ✅ 0 errors, 4 documented pre-existing warnings |
| Bootstrap validation command | `pnpm test -- --reporter=verbose src/core/runtime/bootstrap.test.ts` | ✅ 133 files, 900 tests — all pass              |
| Core validation command      | `pnpm test -- --reporter=verbose src/core/`                          | ✅ 133 files, 900 tests — all pass              |

---

## Pre-existing False-positive Warnings (Known)

These 4 warnings existed before this task and are confirmed scanner false positives per `SECURITY_CODING_PATTERNS.md`:

| File                                                           | Rule                                      | Status                         |
| -------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| `scripts/flags/export.ts:78`                                   | `security/detect-non-literal-fs-filename` | False positive — SEC-05/SEC-16 |
| `scripts/flags/import.ts:75`                                   | `security/detect-non-literal-fs-filename` | False positive — SEC-05/SEC-16 |
| `scripts/load-env.ts:32`                                       | `security/detect-object-injection`        | False positive — SEC-15        |
| `src/modules/feature-flags/.../StaticFeatureFlagService.ts:23` | `security/detect-object-injection`        | False positive — SEC-15        |

---

## Test Coverage — Bootstrap Unit Tests

**File**: `src/core/runtime/bootstrap.test.ts`

| Test ID | Description                                                 | Result  |
| ------- | ----------------------------------------------------------- | ------- |
| MR-1    | Same Container instance within one React cache scope        | ✅ PASS |
| MR-2    | Fresh Container after module reset (new request simulation) | ✅ PASS |
| MR-3    | `createChild()` resolves through shared cached parent       | ✅ PASS |

---

## Changes Validated

### Layer 1 — React.cache() wrapper

- `src/core/runtime/bootstrap.ts`: `getRequestScopedContainer` module-level `cache()` constant confirmed working
- Public API `getAppContainer()` unchanged

### New Relic instrumentation

- `src/core/observability/new-relic.ts`: facade with lazy singleton, `withContainerCreationSpan`, `recordContainerCreated`, `getBrowserTimingHeaderSafe`, and env-backed browser snippet helpers
- `src/instrumentation.ts`: conditional `require('newrelic')` in Node.js runtime branch
- `newrelic.js`: agent config — enabled only when `NEW_RELIC_ENABLED=true` AND `NEW_RELIC_LICENSE_KEY` set
- `next.config.ts`: `newrelic` added to `serverExternalPackages`
- `src/app/layout.tsx`: NR browser agent injected via a native `<script>` in the root `<head>` when `env.NEW_RELIC_ENABLED`
- `src/core/env.ts`: `NEW_RELIC_ENABLED`, `NEW_RELIC_APP_NAME`, `NEW_RELIC_LICENSE_KEY`, `NEW_RELIC_BROWSER_SNIPPET`, and `NEW_RELIC_BROWSER_SNIPPET_BASE64` added to schema
- `.env.example`: New Relic section and browser snippet transport guidance added
- `package.json`: explicit `server-only` dependency added so the server-only guard resolves in Vitest/Vite as well as Next.js

### Next.js upgrade

- Upgraded from 16.2.1 → 16.2.2
- No regressions — all 892 tests pass

---

## Residual Items

| Item                                    | Status      | Notes                                                                                                |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Layer 2 (read-model memoization)        | ⏭️ Deferred | By user decision — create separate task after Layer 1 validated in production                        |
| New Relic browser agent connection wait | ⏭️ Deferred | Using `allowTransactionlessInjection: true` — no wait loop; first few requests may have empty header |
| `nrExternals` webpack call              | ⏭️ Deferred | Not needed — Next.js 15+ auto-excludes `newrelic`; `serverExternalPackages` covers it                |

---

## Post-Dev-Test Fixes (2026-04-05)

Two issues identified from dev smoke test logs and fixed:

### Fix 1 — `getBrowserTimingHeaderSafe()` connection guard

**Root cause**: `getBrowserTimingHeader()` was called before the NR agent received its `application_id` from the collector (agent still in "connecting" state on first page loads — ~7s after server start).
**Symptom**: Log lines `"NREUM: browser_monitoring requires valid application_id"` (log lines 17-18).
**Fix**: Added `nr.agent.collector.isConnected()` guard — function returns `''` when agent is not yet connected. Browser monitoring silently skips for requests during the connection window. No blocking, no latency.

### Fix 2 — CSP `connect-src` missing NR browser beacon domains

**Root cause**: The CSP `connect-src` directive did not include NR browser agent data collection endpoints. The browser agent script was injecting correctly (`'unsafe-inline'` allows inline scripts) but all XHR/fetch beacon calls were being blocked by CSP.
**Confirmed endpoints**: `bam.eu01.nr-data.net` (EU — confirmed by log line 23 showing `collector.eu01.nr-data.net`), and `bam.nr-data.net` (US).
**Fix**: Added `newRelicBeaconDomains` array to `connect-src` in `src/security/middleware/with-headers.ts`, alongside existing Sentry and Clerk domains (consistent with existing pattern).

### Validation after fixes

| Gate                                                                 | Result                                          |
| -------------------------------------------------------------------- | ----------------------------------------------- |
| Editor diagnostics on reviewed files                                 | ✅ No errors                                    |
| `pnpm typecheck`                                                     | ✅ Pass                                         |
| `pnpm lint --fix`                                                    | ✅ Pass with 4 documented pre-existing warnings |
| `pnpm test -- --reporter=verbose src/core/runtime/bootstrap.test.ts` | ✅ Pass                                         |
| `pnpm test -- --reporter=verbose src/core/`                          | ✅ Pass                                         |
