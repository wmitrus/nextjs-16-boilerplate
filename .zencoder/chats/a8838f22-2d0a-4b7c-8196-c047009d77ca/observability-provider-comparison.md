# Observability Provider Comparison: New Relic vs Better Stack

**Task ID**: 43 (Leantime)
**Authored By**: 06 - Debug Investigation Agent + Architecture Guard Agent
**Date**: 2026-04-12
**Status**: Research complete — awaiting design decision

---

## Context

This document compares New Relic and Better Stack as observability providers for a **Next.js 16 App Router** boilerplate deployed on **Vercel**. It accounts for existing constraints:

- `NODE_OPTIONS=-r newrelic` crashes Vercel builds (confirmed)
- NR 88KB browser snippet exceeds Vercel 64KB env var limit (confirmed)
- Repository already has pino + Logflare streams (`LOGFLARE_*` env vars), Sentry error tracking, and the broken NR integration
- Architecture requires every provider to be independently enable/disable-able
- This is a boilerplate — consumers must be able to pick their combination

---

## Integration Method Matrix

### Better Stack

| Integration Type                 | Method                                                                 | Vercel Compatible | `NODE_OPTIONS` Required |
| -------------------------------- | ---------------------------------------------------------------------- | ----------------- | ----------------------- |
| **Log forwarding — server**      | `@logtail/pino` transport OR `@logtail/next` wrapping `next.config.ts` | ✅ Yes            | ❌ No                   |
| **Log forwarding — edge**        | `@logtail/next`                                                        | ✅ Yes            | ❌ No                   |
| **Log forwarding — client**      | `@logtail/next` proxy route (`/_betterstack/*`)                        | ✅ Yes            | ❌ No                   |
| **Web Vitals (RUM)**             | `<BetterStackWebVitals />` component in `layout.tsx`                   | ✅ Yes            | ❌ No                   |
| **Session replay**               | Built into RUM / error tracking product                                | ✅ Yes            | ❌ No                   |
| **Error tracking**               | `@logtail/next` captures exceptions automatically                      | ✅ Yes            | ❌ No                   |
| **Distributed traces**           | OTel-native ingestion                                                  | ✅ Yes            | ❌ No                   |
| **Uptime monitoring**            | External HTTP checks (SaaS, not code)                                  | ✅ Yes            | ❌ No                   |
| **Status page**                  | External SaaS                                                          | ✅ Yes            | ❌ No                   |
| **Vercel log drain**             | Available via Vercel marketplace (formerly Logtail, now Better Stack)  | ✅ Yes            | ❌ No                   |
| **APM-style transaction traces** | Via OTel SDK (not native APM)                                          | ✅ Yes            | ❌ No                   |

**Critical note**: Better Stack has a Vercel marketplace integration ("Better Stack — formerly Logtail for Vercel"). This is a direct Vercel log drain, same category as the NR log drain.

---

### New Relic

| Integration Type             | Method                                  | Vercel Compatible                  | `NODE_OPTIONS` Required |
| ---------------------------- | --------------------------------------- | ---------------------------------- | ----------------------- |
| **Log forwarding**           | Vercel log drain (official integration) | ✅ Yes                             | ❌ No                   |
| **APM transaction traces**   | Node.js agent (`newrelic` npm)          | ❌ Broken on Vercel                | ✅ Yes (crashes)        |
| **Distributed traces**       | OTel via Vercel integration (Beta)      | ✅ Yes (Beta)                      | ❌ No                   |
| **Browser monitoring**       | APM-linked `getBrowserTimingHeader()`   | ❌ Broken (requires connected APM) | —                       |
| **Browser monitoring (alt)** | NR Browser standalone CDN agent         | ✅ Yes                             | ❌ No                   |
| **Custom attributes**        | `nr.addCustomAttribute()`               | ❌ Broken (requires APM agent)     | —                       |
| **Custom spans**             | `nr.startSegment()`                     | ❌ Broken (requires APM agent)     | —                       |
| **Web Vitals / RUM**         | No native RUM product                   | ❌ N/A                             | —                       |
| **Session replay**           | No session replay product               | ❌ N/A                             | —                       |
| **Error tracking**           | NR Errors Inbox (via logs/agent)        | Partial (log-based only)           | —                       |
| **Uptime monitoring**        | NR Synthetics                           | ✅ Yes (external)                  | ❌ No                   |
| **Status page**              | No native status page                   | ❌ N/A                             | —                       |

---

## Feature Comparison: Side by Side

| Capability                       | Better Stack                                   | New Relic                       | Winner (Vercel)             |
| -------------------------------- | ---------------------------------------------- | ------------------------------- | --------------------------- |
| **Log forwarding — server**      | ✅ Native (`@logtail/pino` or `@logtail/next`) | ✅ Via log drain                | Tie                         |
| **Log forwarding — client**      | ✅ Proxy route built-in                        | ❌ Not available                | **Better Stack**            |
| **Log forwarding — edge**        | ✅ Built-in                                    | ❌ Not available                | **Better Stack**            |
| **Web Vitals**                   | ✅ `<BetterStackWebVitals />`                  | ❌ No native RUM                | **Better Stack**            |
| **Session replay**               | ✅ 5,000 sessions/month (free)                 | ❌ None                         | **Better Stack**            |
| **RUM (Real User Monitoring)**   | ✅ Full product                                | ❌ None                         | **Better Stack**            |
| **Error tracking**               | ✅ AI-native, automatic                        | ⚠️ Log-based only on Vercel     | **Better Stack**            |
| **APM transaction traces**       | ⚠️ OTel spans (not classic APM)                | ❌ Broken on Vercel             | Tie (OTel)                  |
| **Distributed traces**           | ✅ OTel-native                                 | ✅ OTel Beta                    | Tie                         |
| **Custom spans (DI containers)** | ⚠️ Via OTel SDK                                | ❌ Broken on Vercel             | **Better Stack** (via OTel) |
| **Browser monitoring**           | ✅ Full RUM product                            | ⚠️ CDN agent (needs setup)      | **Better Stack**            |
| **APM-style dashboards**         | ⚠️ Log/metric based                            | ✅ Richer APM entity            | **NR (local only)**         |
| **Uptime monitoring**            | ✅ 10 monitors (free)                          | ⚠️ Synthetics (paid)            | **Better Stack**            |
| **Status page**                  | ✅ 1 page (free)                               | ❌ None                         | **Better Stack**            |
| **Vercel integration**           | ✅ Log drain (marketplace)                     | ✅ Log drain + OTel Beta        | Tie                         |
| **Middleware conflict**          | ⚠️ `/_betterstack/*` needs proxy.ts allowlist  | ❌ None                         | **NR**                      |
| **`next.config.ts` wrapper**     | ⚠️ Requires `withBetterStack()` wrap           | ❌ None                         | **NR**                      |
| **Free tier logs**               | 3 GB / 3 days                                  | ~100 GB/month total             | **NR**                      |
| **Free tier log retention**      | 3 days                                         | 8 days (traces)                 | **NR**                      |
| **NerdGraph/NRQL queries**       | No (SQL-like query UI)                         | ✅ NRQL, NerdGraph              | **NR**                      |
| **AI SRE / root cause**          | ✅ AI-native (Beta)                            | ⚠️ NR AI (paid feature)         | **Better Stack**            |
| **Pricing**                      | Free: generous; Paid: $29/mo                   | Free: 100GB data; Paid: complex | Better Stack simpler        |

---

## Better Stack: How It Integrates With This Repo

### Log forwarding path

Better Stack provides a pino transport — directly compatible with the existing `streams.ts` pattern:

```typescript
// Could add a new stream alongside existing Logflare stream:
env.BETTERSTACK_SOURCE_TOKEN ? createBetterStackStream() : undefined;
```

Or via `@logtail/next` wrapping `next.config.ts` — but this means modifying the Sentry + Next.js config chain (already `withSentryConfig(nextConfig)`), which requires careful ordering.

### Client-side logs + Web Vitals

Better Stack's `@logtail/next` creates a `/_betterstack/*` proxy route for client-side log forwarding. In this repo, the proxy-style middleware lives in `src/proxy.ts`. The `/_betterstack/*` route needs to be allowlisted in proxy/auth guards.

### Middleware conflict (important)

Better Stack's Next.js client documentation explicitly shows how to configure Clerk middleware to allow `/_betterstack/*`. This repo uses `src/proxy.ts` (not `middleware.ts`), so the allowlist needs to be added there.

### Web Vitals

```tsx
// layout.tsx addition:
import { BetterStackWebVitals } from '@logtail/next/webVitals';
// Add inside <head> or <body>:
<BetterStackWebVitals />;
```

This is much simpler than the NR browser agent approach.

### Vercel log drain (alternative to npm package)

Better Stack also appears in the Vercel marketplace as a log drain integration ("Better Stack — formerly Logtail for Vercel"). This gives stdout log forwarding without any npm package, similar to the NR log drain approach.

---

## New Relic: What Still Works Locally

On **local development**, the NR Node.js agent works correctly:

- `getBrowserTimingHeader()` returns the SPA snippet
- Custom attributes via `addCustomAttribute()` work
- DI container spans via `startSegment()` work
- APM transaction traces appear in NR UI

On **Vercel**: log drain + OTel traces work. APM-linked features do not.

---

## Decision Framework: When to Use Each / Both

### Option 1: Better Stack Only

**Best for**: Projects that want a single unified platform, simpler setup, and don't need classic APM.

**Provides**:

- Log forwarding (server + edge + client)
- Web Vitals + RUM + session replay
- Error tracking (auto)
- Uptime monitoring + status page
- OTel-native distributed traces
- Vercel compatible natively

**Missing**:

- Classic APM transaction view (NR-style Apdex, throughput graphs)
- NRQL query power
- NR ecosystem (NerdGraph, alerting depth)

---

### Option 2: New Relic Only (with Vercel integration)

**Best for**: Teams already invested in NR, need NRQL, NerdGraph, or classic APM locally.

**Provides**:

- Log forwarding on Vercel (log drain)
- OTel traces (Beta)
- Browser monitoring via CDN standalone agent
- Full APM (local dev only)
- NRQL + NerdGraph + existing `pnpm nr` scripts

**Missing**:

- Web Vitals without additional setup
- Session replay (no NR native product)
- Uptime monitoring (NR Synthetics is paid)
- Status page
- Client-side log forwarding on Vercel

---

### Option 3: NR (APM/local) + Better Stack (Vercel/production)

**Best for**: Teams that want APM depth in local/dev but need production-grade Vercel observability.

**Architecture**:

- `NEW_RELIC_ENABLED=true` → local/dev only → APM agent works
- `BETTERSTACK_ENABLED=true` → Vercel → log drain + RUM + traces
- NR Browser CDN standalone → replaces APM-linked browser monitoring (can be NR or Better Stack RUM)

**Provides everything** but has two providers to configure.

---

### Option 4: NR (log drain + OTel) + Better Stack (RUM + uptime)

**Best for**: Wanting NR's query power for backend logs/traces + Better Stack's RUM/uptime for frontend.

- NR log drain: backend function logs
- NR OTel (Beta): distributed traces
- Better Stack RUM: Web Vitals, session replay, client errors
- Better Stack Uptime: status page, monitors

---

## Boilerplate Design Principle

Since this is a boilerplate, **every integration must be independently toggleable**:

### Proposed env var surface

```bash
# New Relic
NEW_RELIC_ENABLED=false                    # APM agent (local dev only - breaks on Vercel)
NEW_RELIC_LICENSE_KEY=                     # APM + log drain key
NEW_RELIC_BROWSER_ENABLED=false            # NR Browser CDN standalone agent
NEW_RELIC_BROWSER_LICENSE_KEY=             # Browser-specific key (separate from APM)
NEW_RELIC_BROWSER_APP_ID=                  # NR Browser app ID
NEW_RELIC_LOG_DRAIN_ENABLED=false          # Vercel log drain (manual setup in Vercel UI)
NEW_RELIC_OTEL_ENABLED=false               # OTel traces via Vercel integration (manual)

# Better Stack
BETTERSTACK_ENABLED=false                  # Master switch
BETTERSTACK_SOURCE_TOKEN=                  # Server + edge logs
NEXT_PUBLIC_BETTERSTACK_SOURCE_TOKEN=      # Client logs
BETTERSTACK_WEB_VITALS_ENABLED=false       # <BetterStackWebVitals />
BETTERSTACK_UPTIME_ENABLED=false           # Uptime monitors (external, doc-only)

# Existing
LOGFLARE_SERVER_ENABLED=false              # Logflare (keep as is)
LOGFLARE_EDGE_ENABLED=false
NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED=false
```

### Architecture contracts required

1. **Logger stream registry** in `src/core/logger/streams.ts` — add streams per-provider based on env flags
2. **Observability facade** in `src/core/observability/` — per-provider files, never spread across features
3. **CSP updates** in `src/security/middleware/with-headers.ts` — per-provider domain allowlists
4. **Proxy allowlist** in `src/proxy.ts` — `/_betterstack/*` if Better Stack client logs enabled
5. **Layout injection** gated by env — `<BetterStackWebVitals />`, `<Script src="nr-browser" />` etc.
6. **`next.config.ts` wrapper order** — `withSentryConfig(withBetterStack?(nextConfig))` if BS Next.js client used

---

## Summary Recommendation

| Scenario                         | Recommendation                                                         |
| -------------------------------- | ---------------------------------------------------------------------- |
| Solo boilerplate, simplest setup | Better Stack only (free tier covers all basics)                        |
| NR ecosystem investment          | NR log drain + NR Browser CDN + Better Stack RUM/uptime                |
| Maximum observability depth      | NR APM (local) + NR log drain + Better Stack (RUM + uptime)            |
| Full platform unification        | Better Stack only (replaces Logflare + NR Browser + uptime monitoring) |

**For this boilerplate**: The cleanest approach is to design all three as optional — NR (APM + browser + log drain), Better Stack, and Logflare (existing) — each independently enabled. The boilerplate consumer picks their combination via env vars.

---

## Open Questions for User

1. Should Better Stack be **added alongside** NR, or is the intent to **replace Logflare + NR** entirely with Better Stack for Vercel projects?
2. Should the `@logtail/next` wrapper approach be used (wraps `next.config.ts`) or the pino transport approach (integrates with existing `streams.ts`)?
3. Is uptime monitoring + status page (Better Stack free tier) in scope for the boilerplate, or is that a separate concern?
