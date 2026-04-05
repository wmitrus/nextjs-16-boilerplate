# Implementation Report: Per-Request DI Container Caching + New Relic

**Task ID**: `2026-04-05-per-request-caching`
**Agent**: 04 — Implementation
**Status**: ✅ Complete
**Date**: 2026-04-05

---

## Summary

Both phases are implemented in repository code and final validation evidence has been captured.

---

## Files Changed

### Phase 1 — React.cache() Wrapper

| File                                 | Change                                                                                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/runtime/bootstrap.ts`      | Added `import { cache } from 'react'`; added module-level `getRequestScopedContainer = cache(...)` constant; updated `getAppContainer()` to call it; added NR span wrapper + `recordContainerCreated` call |
| `src/core/runtime/bootstrap.test.ts` | Updated existing test assertion from `.not.toBe` to `.toBe`; added MR-1, MR-2, MR-3; mocked `react.cache` with deterministic implementation; mocked `@/core/observability/new-relic`                       |

### Phase 2 — New Relic Integration

| File                                       | Change                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/observability/new-relic.ts`      | **Created** — New Relic facade with inline `NewRelicApi` interface; lazy `require('newrelic')` with try/catch; browser snippet helpers; `withContainerCreationSpan()` and `recordContainerCreated()` exports |
| `newrelic.js`                              | **Created** — Agent config at repo root; reads from `process.env`; `enabled` gated on `NEW_RELIC_ENABLED` and `NEW_RELIC_LICENSE_KEY`                                                                        |
| `src/core/env.ts`                          | Added `NEW_RELIC_LICENSE_KEY`, `NEW_RELIC_APP_NAME`, `NEW_RELIC_ENABLED`, `NEW_RELIC_BROWSER_SNIPPET`, `NEW_RELIC_BROWSER_SNIPPET_BASE64`                                                                    |
| `.env.example`                             | Added New Relic APM envs, browser snippet transport guidance, and base64 recommendation                                                                                                                      |
| `src/instrumentation.ts`                   | Added conditional `require('newrelic')` in Node.js runtime branch, gated on `NEW_RELIC_ENABLED=true` and `NEW_RELIC_LICENSE_KEY`                                                                             |
| `src/testing/infrastructure/env.ts`        | Added `NEW_RELIC_LICENSE_KEY: undefined`, `NEW_RELIC_APP_NAME`, `NEW_RELIC_ENABLED: false` to test env mock                                                                                                  |
| `package.json` / `pnpm-lock.yaml`          | Added `newrelic` production dependency (v13.18.0) and explicit `server-only` dependency for test/runtime resolution                                                                                          |
| `src/app/layout.tsx`                       | Injects the browser snippet in `<head>` using a native `<script>` tag sourced from env-backed snippet helpers                                                                                                |
| `src/core/observability/new-relic.test.ts` | Added coverage for wrapper stripping, base64 decoding, dotenv `#` truncation recovery, and compatibility handling                                                                                            |

---

## Key Implementation Decisions Made During Execution

1. **Explicit `server-only` guards retained** — `bootstrap.ts` and `new-relic.ts` now use `import 'server-only'`. Vitest-facing test files need a simple `vi.mock('server-only', () => ({}))` shim where those modules are imported.

2. **`React.cache()` mocked in tests** — `React.cache()` only memoizes within an active RSC render context (`ReactCurrentCache.current !== null`). Outside RSC context (in Vitest), it calls the function directly on every invocation without memoization. The test mocks `react.cache` with a deterministic per-call memoizer that simulates the RSC render-pass behavior.

3. **Inline `NewRelicApi` interface** — `newrelic` v13 ships no TypeScript types. Used a minimal inline interface (`startSegment`, `addCustomAttribute`) rather than a `declare module` stub to keep the types accurate and co-located.

4. **Lazy `require('newrelic')`** — The facade uses a one-time lazy `require('newrelic')` with try/catch. This avoids crash if the agent fails to initialize and avoids loading the agent in test environments.

5. **Browser snippet is env-backed, not API-generated in layout** — The final browser integration uses `getBrowserSnippetSafe()` and native `<head><script>` injection. This avoids the Next.js 16 prerender-time `Date.now()` constraint triggered by `getBrowserTimingHeader()`.

6. **Base64 is the preferred local transport** — `NEW_RELIC_BROWSER_SNIPPET_BASE64` is preferred because raw dotenv values can be truncated at `#`. The resolver also re-reads raw env file lines when needed and tolerates compatibility input placed into the `_BASE64` variable.

---

## Validation Outcomes

| Gate                                                                 | Result                                          |
| -------------------------------------------------------------------- | ----------------------------------------------- |
| `pnpm typecheck`                                                     | ✅ Pass                                         |
| `pnpm lint --fix`                                                    | ✅ Pass with 4 documented pre-existing warnings |
| `pnpm test -- --reporter=verbose src/core/runtime/bootstrap.test.ts` | ✅ Pass — 133 files, 900 tests                  |
| `pnpm test -- --reporter=verbose src/core/`                          | ✅ Pass — 133 files, 900 tests                  |

---

## Residual Notes

- `pnpm approve-builds` may be needed for New Relic's native module build scripts (`@newrelic/fn-inspect`, `@newrelic/native-metrics`). These are optional performance enhancement modules; the agent works without them.
- Layer 2 (read-model memoization helpers) is explicitly deferred per design approval.
- The browser snippet artifact should not be stored as a checked-in raw `.js` file. Use env-backed transport only.
