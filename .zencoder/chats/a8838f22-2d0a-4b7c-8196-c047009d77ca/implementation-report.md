# Implementation Report

**Task ID**: 43 (Leantime)
**Step**: Implementation Agent
**Date**: 2026-04-12
**Status**: complete

---

## Scope

Minimum Phase 2 changes per remediation plan and user decision ("document design first, implement multi-provider in separate task").

Full multi-provider implementation (Better Stack `@logtail/next`, NR Browser CDN route rework, `src/proxy.ts` allowlist, `next.config.ts` wrapper) is **deferred to a separate task**.

---

## Files Changed

### 1. `src/core/env.ts` — New env vars added

**Type**: Additive schema + runtime values

**New server-side vars**:

- `NEW_RELIC_BROWSER_ENABLED` — boolean flag (default `false`)
- `NEW_RELIC_BROWSER_LICENSE_KEY` — optional string (NR Browser app browser key)
- `NEW_RELIC_BROWSER_APP_ID` — optional string (NR Browser numeric app ID)
- `NEW_RELIC_LOG_DRAIN_ENABLED` — boolean flag (default `false`, doc-only)
- `NEW_RELIC_OTEL_ENABLED` — boolean flag (default `false`, doc-only)
- `BETTERSTACK_ENABLED` — boolean flag (default `false`)
- `BETTERSTACK_SOURCE_TOKEN` — optional string
- `BETTERSTACK_WEB_VITALS_ENABLED` — boolean flag (default `false`)
- `BETTERSTACK_INGESTING_URL` — optional URL

**New client-side vars**:

- `NEXT_PUBLIC_BETTERSTACK_SOURCE_TOKEN` — optional string
- `NEXT_PUBLIC_BETTERSTACK_INGESTING_URL` — optional URL

**No existing vars changed**. All additions are optional or default-false.

---

### 2. `src/app/observability/new-relic-browser.js/route.ts` — Vercel warning suppression

**Type**: Behavior change (logging level only)

**Change**: When `env.VERCEL_ENV` is set (preview or production), the `[NR Browser] Empty script` log line is emitted as `console.info` instead of `console.warn`. This reflects that APM agent not connecting on Vercel is **expected behavior**, not an actionable warning.

On local dev (`VERCEL_ENV` unset), the warning remains at `console.warn` to signal a genuine configuration problem.

---

### 3. `src/app/observability/new-relic-browser.js/route.test.ts` — Tests updated

**Type**: Test update

**Added test cases**:

- `emits console.warn when agent is unavailable outside Vercel` — verifies local dev warning
- `emits console.info (not warn) when agent is unavailable on Vercel` — verifies Vercel suppression

**Existing tests**: All preserved, `mockEnv.VERCEL_ENV = undefined` added to `beforeEach` reset.

---

### 4. `.env.example` — New vars documented

**Type**: Documentation

**Changes**:

- Added `NODE_OPTIONS=` with a prominent comment: **must remain blank/unset on Vercel**
- Added `NEW_RELIC_BROWSER_ENABLED`, `NEW_RELIC_BROWSER_LICENSE_KEY`, `NEW_RELIC_BROWSER_APP_ID` with setup instructions
- Added `NEW_RELIC_LOG_DRAIN_ENABLED`, `NEW_RELIC_OTEL_ENABLED` as doc-only flags with comments
- Added full Better Stack section with all vars, mode descriptions, and reference link

---

### 5. `docs/features/26 - New Relic Server & Browser Integration.md` — Updated constraints

**Type**: Documentation

**Change**: Updated the "Root Cause Note — Hosted Vercel Runtime" section to:

- Mark `NODE_OPTIONS` as permanently rejected (tested across two tasks)
- Document the late-load `instrumentation.ts` issue explicitly
- Point to the recommended Vercel path (log drain + NR Browser CDN + OTel)
- Reference `docs/features/27 - Observability Multi-Provider Design.md`

---

### 6. `docs/features/27 - Observability Multi-Provider Design.md` — New document

**Type**: New documentation

**Content**: Full multi-provider observability architecture design document covering:

- All provider options (NR, Better Stack, Logflare) independently togglable
- Complete env var surface
- Architecture contracts (stream registry, observability facades, CSP, proxy allowlist, layout injection)
- Integration depth options for Better Stack
- Implementation complexity assessment (~1.5-2 days, low risk)
- Recommended local + Vercel dev setup

---

## Logic Changes

| File               | Before                                          | After                                                          |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------- |
| `route.ts`         | `console.warn(...)` always                      | `console.info(...)` on Vercel, `console.warn(...)` locally     |
| `env.ts`           | NR and Better Stack vars missing                | New optional vars added                                        |
| `.env.example`     | No NR Browser or Better Stack vars              | Full set documented                                            |
| `docs/features/26` | NODE_OPTIONS described as "tested and rejected" | Explicitly marked as permanently rejected with clear reasoning |

---

## Tests Updated

| File            | Change                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `route.test.ts` | Added 2 new test cases for Vercel vs local logging behavior; added `VERCEL_ENV` to `beforeEach` reset |

---

## Deferred (Separate Task)

- `@logtail/next` package installation and `next.config.ts` wrapper
- `src/core/observability/new-relic-browser.ts` — CDN snippet delivery
- `src/core/observability/better-stack.ts` — Better Stack config facade
- `src/core/logger/streams.ts` — `createBetterStackStream()` pino transport
- `src/proxy.ts` — `/_betterstack/*` allowlist
- `src/security/middleware/with-headers.ts` — Better Stack CSP domains
- `src/app/layout.tsx` — `<BetterStackWebVitals />` conditional injection
- `serverExternalPackages` update in `next.config.ts` for `@logtail/*`
