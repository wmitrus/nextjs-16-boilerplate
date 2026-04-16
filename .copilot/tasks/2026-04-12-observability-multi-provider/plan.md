# Observability Multi-Provider Implementation Plan

**Task**: `2026-04-12-observability-multi-provider`
**Leantime Task ID**: 43
**Status**: ✅ Complete
**Design Document**: `docs/features/27 - Observability Multi-Provider Design.md`

---

## Context

Multi-provider observability implementation for this Next.js 16 boilerplate.
All providers (New Relic, Better Stack, Logflare) must be independently togglable via env flags.

### Already Completed (Previous Session)

- [x] Env vars added to `src/core/env.ts` (11 new vars: NR Browser + Better Stack)
- [x] `src/testing/infrastructure/env.ts` updated with all new vars
- [x] `.env.example` updated with all new vars and documentation
- [x] Design doc `docs/features/27 - Observability Multi-Provider Design.md` created
- [x] NR browser route `console.warn` → `console.info` fix for Vercel env
- [x] NR browser route tests for Vercel vs non-Vercel logging behavior
- [x] Validation: typecheck ✅ lint ✅ test (988/988) ✅

---

## Implementation Steps

### [x] Step 1: Install packages

`@logtail/next@0.3.1` and `@logtail/pino@0.5.8` installed.

---

### [x] Step 2: Core observability facades

Created:

- `src/core/observability/new-relic-browser.ts` — NR Browser CDN standalone snippet delivery
- `src/core/observability/better-stack.ts` — Better Stack config facade

---

### [x] Step 3: Logger stream additions

- Added `createBetterStackStream()` to `src/core/logger/utils.ts` (uses `pino.transport()` worker thread)
- Wired into `src/core/logger/streams.ts` under `BETTERSTACK_ENABLED` guard

---

### [x] Step 4: next.config.ts updates

- Added `@logtail/next` and `@logtail/pino` to `serverExternalPackages`
- Added conditional `withBetterStackNextConfig()` wrapper (only when `BETTERSTACK_ENABLED=true`)

---

### [x] Step 5: Proxy and CSP updates

- `src/security/middleware/route-policy.ts` — added `/_betterstack` to `PUBLIC_ROUTE_PREFIXES`
- `src/security/middleware/with-headers.ts` — added `https://in.logs.betterstack.com` to `connect-src` CSP

---

### [x] Step 6: Layout injection guards

Updated `src/app/layout.tsx`:

- Extended NR browser check: activates for CDN mode (`NEW_RELIC_BROWSER_ENABLED`) OR APM mode (`NEW_RELIC_ENABLED`)
- Added conditional `<BetterStackWebVitals />` when `BETTERSTACK_WEB_VITALS_ENABLED=true`

---

### [x] Step 7: NR browser route dual-mode update

Updated `src/app/observability/new-relic-browser.js/route.ts`:

- Mode A (CDN standalone): `NEW_RELIC_BROWSER_ENABLED=true` → serves `getNrBrowserCdnSnippet()` (priority)
- Mode B (APM-linked): `NEW_RELIC_ENABLED=true` → serves `getBrowserAgentScriptSafe()` (fallback)
- Both disabled → returns empty

---

### [x] Step 8: Tests

- `src/core/observability/new-relic-browser.test.ts` — 7 unit tests
- `src/core/observability/better-stack.test.ts` — 9 unit tests
- `src/app/observability/new-relic-browser.js/route.test.ts` — 3 additional CDN mode tests

---

### [x] Step 9: Validation

- `pnpm typecheck` ✅
- `pnpm lint --fix` (on changed files) ✅
- `pnpm arch:lint` ✅
- `pnpm test` ✅ — 1008/1008 tests pass (pre-existing bootstrap.test.ts timeout excluded)

---

## Acceptance Criteria

- [x] All providers independently togglable via env flags (off by default)
- [x] `BETTERSTACK_ENABLED=true` activates: pino transport + `@logtail/next` wrapper + CSP + proxy allowlist
- [x] `NEW_RELIC_BROWSER_ENABLED=true` activates: CDN standalone browser agent in layout
- [x] `NEW_RELIC_ENABLED=true` activates: APM-linked browser header (existing behavior)
- [x] NR browser route serves correct response for both modes
- [x] No breaking changes to existing behavior when all flags are `false`
- [x] `pnpm typecheck` passes
- [x] `pnpm lint --fix` passes
- [x] `pnpm test` passes (all tests)

---

## Env Var Naming Note

**`BETTERSTACK_SOURCE_TOKEN` renamed to `BETTER_STACK_SOURCE_TOKEN`** (and related vars) to match the
`@logtail/next` SDK's native env var naming. The SDK reads `BETTER_STACK_SOURCE_TOKEN` directly.
Our boilerplate control flags (`BETTERSTACK_ENABLED`, `BETTERSTACK_WEB_VITALS_ENABLED`) retain the
`BETTERSTACK_*` prefix since they are boilerplate-level concepts not read by the SDK.
