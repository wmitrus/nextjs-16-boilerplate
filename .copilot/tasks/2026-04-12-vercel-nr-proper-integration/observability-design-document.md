# Observability Design Document — Multi-Provider Architecture

**Task ID**: 43 (Leantime)
**Type**: Architecture Design Document (no implementation yet)
**Date**: 2026-04-12
**Status**: Draft — pending user approval before implementation task creation

---

## Design Decisions Recorded

| Decision                 | Choice                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| Provider strategy        | All three (NR + Better Stack + Logflare) independently togglable       |
| Better Stack integration | `@logtail/next` for full Vercel depth; pino transport optional locally |
| Local file logging       | Keep existing `LOG_TO_FILE_DEV` path for MCP/debugging                 |
| Scope of this task       | **Document only** — implementation is a separate task                  |

---

## Complexity and Performance Assessment

### Complexity: Low-to-Medium

The existing architecture already has the right shape:

- `streams.ts` already builds an array of pino streams from env flags — adding Better Stack is one more `if (env.BETTERSTACK_ENABLED)` entry
- The `next.config.ts` already wraps via `withSentryConfig(nextConfig)` — adding `withBetterStack()` extends this to `withSentryConfig(withBetterStack(nextConfig))` if the Next.js client is used
- All providers use the same module boundary: `src/core/observability/` and `src/core/logger/`

**Complicating factor**: `@logtail/next` creates a `/_betterstack/*` proxy route in the Next.js app for client-side log forwarding. This route must be allowlisted in `src/proxy.ts` (Clerk guard). One targeted change required — `src/proxy.ts` is the right place for it per repo conventions.

**Not complicated**: Adding env vars, a pino stream factory, and CSP entries. The existing patterns are designed for exactly this extension.

### Performance: Negligible Impact

| Concern                            | Finding                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| Better Stack HTTP send             | Async — batched, non-blocking, background worker in `@logtail/next` |
| Pino `@logtail/pino` transport     | Async worker thread — does not block request processing             |
| Local file logging                 | Already sync in dev (`destination({ sync: true })`) — no change     |
| `withBetterStack()` config wrapper | Build-time only — zero runtime overhead                             |
| `/_betterstack/*` proxy route      | Only called by browser client-side logging — not in hot path        |
| NR CDN browser agent               | CDN-loaded, deferred — `strategy="beforeInteractive"` adds preload  |
| Multiple pino streams              | Marginal: 1-2ms per log line across streams — acceptable            |
| Log drain (NR or BS)               | Vercel-side — zero app overhead                                     |

**Recommendation**: Enable only what you need per environment. Dev: file + console (+ optional pino transport for testing). Production: `@logtail/next` or log drain, not both simultaneously.

---

## Environment Variable Architecture

### Full Proposed Env Surface

```bash
# ─────────────────────────────────────────────
# LOGGING — Core (existing, keep as-is)
# ─────────────────────────────────────────────
LOG_LEVEL=info
LOG_DIR=logs
LOG_TO_FILE_DEV=false        # Local file logging for dev/MCP analysis
LOG_TO_FILE_PROD=false       # File logging in production (not useful on Vercel — read-only FS)
PINO_LOG_DEST=               # Optional: force stdout destination

# ─────────────────────────────────────────────
# LOGFLARE (existing — kept, no change)
# ─────────────────────────────────────────────
# Note: Better Stack offers the same capability with better DX.
# Logflare remains for users who already have it configured.
LOGFLARE_API_KEY=
LOGFLARE_SOURCE_TOKEN=
LOGFLARE_SOURCE_NAME=
LOGFLARE_SERVER_ENABLED=false
LOGFLARE_EDGE_ENABLED=false
NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED=false

# ─────────────────────────────────────────────
# BETTER STACK — Recommended for Vercel projects
# ─────────────────────────────────────────────
# Better Stack provides: logs (server + edge + client), Web Vitals,
# error tracking, session replay, OTel traces, uptime, status page.
# All features work on Vercel without NODE_OPTIONS.
#
# Integration modes:
#   Mode A: @logtail/next (full depth — Next.js config wrapper)
#     → server + edge + client logs + Web Vitals via layout component
#     → requires withBetterStack() in next.config.ts
#     → requires /_betterstack/* allowlist in src/proxy.ts
#
#   Mode B: @logtail/pino (server logs only — pino stream)
#     → works alongside local file + console streams
#     → useful for local testing with BS source token

BETTERSTACK_ENABLED=false
# Source token for server-side logging (@logtail/pino or @logtail/next server)
BETTERSTACK_SOURCE_TOKEN=
# Source token for client-side logging (@logtail/next browser proxy)
# Set to same value as BETTERSTACK_SOURCE_TOKEN unless using separate sources
NEXT_PUBLIC_BETTERSTACK_SOURCE_TOKEN=
# Web Vitals (LCP, CLS, FID, INP) — adds <BetterStackWebVitals /> to layout
BETTERSTACK_WEB_VITALS_ENABLED=false
# Ingesting URL override (default: https://in.logs.betterstack.com)
BETTERSTACK_INGESTING_URL=
NEXT_PUBLIC_BETTERSTACK_INGESTING_URL=

# ─────────────────────────────────────────────
# NEW RELIC — Multi-mode, each independently togglable
# ─────────────────────────────────────────────
# NEW_RELIC_ENABLED controls the Node.js APM agent (newrelic npm package).
# This works LOCALLY but NOT on Vercel (NODE_OPTIONS crash).
# Keep enabled locally for APM transaction traces and custom spans.
NEW_RELIC_ENABLED=false
NEW_RELIC_LICENSE_KEY=
NEW_RELIC_APP_NAME=nextjs-16-boilerplate

# NR Browser standalone CDN agent — independent of APM agent.
# Provides: page views, SPA navigation, JS errors, Core Web Vitals.
# Requires: separate NR Browser application created in NR UI.
# Works on Vercel WITHOUT the APM agent being connected.
NEW_RELIC_BROWSER_ENABLED=false
NEW_RELIC_BROWSER_LICENSE_KEY=    # Browser-specific key (from NR Browser app setup)
NEW_RELIC_BROWSER_APP_ID=         # Numeric app ID (from NR Browser app setup)
# Optional: nonce for CSP-compatible inline scripts
NEW_RELIC_BROWSER_NONCE_ENABLED=false

# NR Vercel Log Drain — enabled via Vercel UI, no code changes.
# This flag is documentation-only (tells env:check to expect log drain is active).
# Actual setup: Vercel marketplace → New Relic integration → Add
NEW_RELIC_LOG_DRAIN_ENABLED=false

# NR OpenTelemetry traces — enabled via Vercel UI (Traces Beta toggle).
# Documentation-only flag — actual setup is in Vercel integration config.
NEW_RELIC_OTEL_ENABLED=false

# NR NerdGraph debugging (existing, keep as-is)
NEW_RELIC_NERDGRAPH_API_URL=
NEW_RELIC_USER_API_KEY=
NEW_RELIC_ACCOUNT_ID=
```

---

## Architecture Contracts

### 1. Logger Stream Registry (`src/core/logger/streams.ts`)

Pattern: add one factory function per provider, guarded by env flag.

```
getLogStreams() returns:
  - createConsoleStream()         if dev/test
  - createFileStream()            if LOG_TO_FILE_DEV / LOG_TO_FILE_PROD
  - createLogflareWriteStream()   if LOGFLARE_SERVER_ENABLED
  - createBetterStackStream()     if BETTERSTACK_ENABLED          ← NEW
```

`createBetterStackStream()` uses `@logtail/pino`:

```typescript
// src/core/logger/utils.ts (new export):
export function createBetterStackStream(): DestinationStream | null {
  if (!env.BETTERSTACK_SOURCE_TOKEN) return null;
  // uses @logtail/pino createWriteStream equivalent
}
```

### 2. Observability Facade (`src/core/observability/`)

File structure (current + proposed):

```
src/core/observability/
  new-relic.ts              ← existing (APM + browser header)
  new-relic-browser.ts      ← NEW: CDN standalone browser agent snippet
  better-stack.ts           ← NEW: Better Stack Web Vitals + client config
```

**Rule**: No direct `@logtail/*` or `newrelic` imports outside these files. Callers use only the facade exports.

### 3. `next.config.ts` Wrapper Chain

Current:

```typescript
export default withSentryConfig(nextConfig, sentryOptions);
```

With Better Stack `@logtail/next`:

```typescript
import { withBetterStack } from '@logtail/next';
export default withSentryConfig(
  withBetterStack(nextConfig), // ← wraps nextConfig first
  sentryOptions,
);
```

**Order matters**: Sentry wraps outermost (as documented). `withBetterStack` is inner.
**Guard**: `withBetterStack` should only be applied when `BETTERSTACK_ENABLED=true` — conditional wrapper:

```typescript
const configWithBS = env.BETTERSTACK_ENABLED
  ? withBetterStack(nextConfig)
  : nextConfig;
export default withSentryConfig(configWithBS, sentryOptions);
```

### 4. `src/proxy.ts` Allowlist

When `BETTERSTACK_ENABLED=true`, the `/_betterstack/*` route must bypass Clerk auth:

```typescript
// src/proxy.ts — add to public routes:
'/_betterstack/(.*)'; // Better Stack client telemetry proxy
```

**Note**: This repo uses `src/proxy.ts` not `middleware.ts`. The Better Stack docs show `middleware.ts` examples but the pattern is identical — add the path to the public route matcher.

### 5. `src/security/middleware/with-headers.ts` — CSP Updates

Better Stack domains to add to CSP (when `BETTERSTACK_ENABLED=true`):

- `connect-src`: `https://in.logs.betterstack.com`

NR Browser CDN domains (already present in repo — verify):

- `script-src`: `https://js-agent.newrelic.com` ✅ already there
- `connect-src`: `https://bam.nr-data.net`, `https://bam.eu01.nr-data.net` ✅ already there

### 6. Layout Injection (`src/app/layout.tsx`)

| Feature                 | Component                                              | Guard                            |
| ----------------------- | ------------------------------------------------------ | -------------------------------- |
| NR Browser CDN          | `<Script src="/observability/new-relic-browser.js" />` | `NEW_RELIC_BROWSER_ENABLED`      |
| Better Stack Web Vitals | `<BetterStackWebVitals />`                             | `BETTERSTACK_WEB_VITALS_ENABLED` |

Both use the env flags as gates. Both are server-side conditionals that render the component or nothing.

### 7. NR Browser CDN Route (`src/app/observability/new-relic-browser.js/route.ts`)

Dual-mode route:

- If `NEW_RELIC_ENABLED=true` AND APM agent connected: serve `getBrowserTimingHeaderSafe()` (existing)
- If `NEW_RELIC_BROWSER_ENABLED=true` AND `NEW_RELIC_BROWSER_APP_ID` set: serve CDN config snippet (new)
- Otherwise: return empty (existing behavior)

---

## Recommended Local Dev Logging Setup

For developers using this boilerplate who want local file logging for MCP analysis:

```bash
# .env.local — local development with full logging
LOG_TO_FILE_DEV=true         # writes to logs/server.log — MCP can read this
LOG_LEVEL=debug              # capture all levels locally

# Optional: also send to Better Stack for testing your BS config:
BETTERSTACK_ENABLED=true
BETTERSTACK_SOURCE_TOKEN=your-dev-source-token  # use a separate "dev" source in BS

# New Relic APM (works locally):
NEW_RELIC_ENABLED=true
NEW_RELIC_LICENSE_KEY=your-key
```

Vercel production setup:

```bash
# Vercel environment variables:
BETTERSTACK_ENABLED=true
BETTERSTACK_SOURCE_TOKEN=your-prod-source-token
NEXT_PUBLIC_BETTERSTACK_SOURCE_TOKEN=your-prod-source-token
BETTERSTACK_WEB_VITALS_ENABLED=true

# OR New Relic:
NEW_RELIC_LOG_DRAIN_ENABLED=true   # doc-only: Vercel integration set up manually
NEW_RELIC_BROWSER_ENABLED=true
NEW_RELIC_BROWSER_LICENSE_KEY=your-browser-key
NEW_RELIC_BROWSER_APP_ID=12345678

# Both can be enabled simultaneously — they don't conflict
```

---

## Implementation Complexity Summary

| Component                                     | Complexity | Risk | Notes                               |
| --------------------------------------------- | ---------- | ---- | ----------------------------------- |
| Env var additions to `src/core/env.ts`        | Low        | None | Pattern already established         |
| `createBetterStackStream()` in `streams.ts`   | Low        | None | Same pattern as Logflare            |
| `withBetterStack()` in `next.config.ts`       | Low        | Low  | Check `serverExternalPackages` list |
| `/_betterstack/*` allowlist in `src/proxy.ts` | Low        | None | Single route entry                  |
| `src/core/observability/new-relic-browser.ts` | Low-Medium | Low  | New file, isolated                  |
| `src/core/observability/better-stack.ts`      | Low        | None | Config/flag file                    |
| CSP update in `with-headers.ts`               | Low        | None | One domain addition                 |
| Layout injection guards                       | Low        | None | Env-guarded conditionals            |
| NR browser route dual-mode                    | Medium     | Low  | Two code paths, needs tests         |
| `_betterstack` middleware allowlist           | Low        | None | One line in proxy.ts                |
| Documentation updates                         | Medium     | None | Multiple doc files                  |

**Total estimate**: 1.5-2 days for a complete, tested, documented implementation.

**No breaking changes expected** — all additions are additive and env-guarded.

---

## What to Create as a New Task

When ready to implement, create task: `2026-04-XX-observability-multi-provider`

Steps:

1. Env schema additions (`src/core/env.ts`)
2. Logger stream additions (`src/core/logger/`)
3. New observability facades (`src/core/observability/`)
4. `next.config.ts` conditional wrapper
5. `src/proxy.ts` allowlist
6. CSP updates
7. Layout injection guards
8. NR browser route dual-mode
9. Test coverage (unit + integration)
10. Documentation update (`docs/features/26 - ...` + new `27 - Better Stack Integration.md`)
11. `.env.example` + `.env.local` example updates

---

## Summary for User

**Better Stack is the better Vercel integration** for this boilerplate:

- No `NODE_OPTIONS`
- Server + edge + client logs
- Web Vitals + session replay + error tracking built in
- Uptime monitoring + status page on free tier
- Simpler than managing NR APM + NR Browser separately

**Architecture**: All providers independently toggleable via env flags. You test both on dev, pick what you want per project.

**Implementation complexity**: Low-to-medium. No performance concerns. The existing patterns in this repo are well-designed for this extension.

**Recommended next step**: Create the implementation task once you've tested Better Stack manually (set up a source in BS UI, get a token, test log drain).
