# Incident Intake — New Relic Browser: Only 1 Request Visible

## Symptom

User navigates across multiple pages (main, security-showcase, feature-flags-demo, envs) on preview, dev, and production. New Relic Browser shows only **1 request** — the initial hard page load. Subsequent client-side navigations are invisible.

## Environment

- **Platform**: Vercel (preview + production) and local dev
- **Framework**: Next.js 16 App Router — client-side navigation via `history.pushState` (soft navigations)
- **NR APM (server)**: Working correctly — server-side requests visible in NR APM
- **NR Browser (client)**: Broken — only 1 page view per hard navigation

## Reproduction

1. Deploy to Vercel or run locally with NR enabled
2. Navigate: `/` → `/security-showcase` → `/feature-flags-demo` → `/envs`
3. Check NR Browser → Page Views / Browser Monitoring → Only initial load visible

## Root Cause Analysis

### Root Cause 1 — Browser snippet not reliably delivered

The route `/observability/new-relic-browser.js` calls `getBrowserAgentScriptSafe()` which:

1. First tries `getBrowserTimingHeaderSafe()` → requires `nr.agent?.collector?.isConnected()` to be `true`
2. Falls back to `process.env.NEW_RELIC_BROWSER_SNIPPET_BASE64`
3. Falls back to `process.env.NEW_RELIC_BROWSER_SNIPPET`

**Problem**: On Vercel serverless, `isConnected()` returns false on cold starts and unreliable on warm starts (NR APM agent needs time to establish collector connection). The env var fallbacks (`NEW_RELIC_BROWSER_SNIPPET_BASE64`, `NEW_RELIC_BROWSER_SNIPPET`) are NOT configured in Vercel environment (commented out in `.env.local`, empty in `.env.example`).

**Result**: The browser script route returns an empty response on many requests → browser agent never loads → 0 or sporadic tracking.

### Root Cause 2 — Soft navigations not instrumented

Next.js App Router uses `history.pushState` for client-side route changes. These are "soft navigations" — no full page reload. The NR Browser **standard agent** only tracks:

- Initial hard page load
- XHR/fetch calls within a page

It does NOT automatically track `pushState`-based navigations as new page views.

The NR Browser **SPA agent** automatically intercepts `pushState`/`popState` and creates "route change interactions". But:

1. It's unknown whether the SPA snippet type is configured in the NR UI
2. Even the SPA agent benefits from explicit `onRouterTransitionStart` instrumentation for precise naming

**Problem**: `instrumentation-client.ts` exports `onRouterTransitionStart` only for Sentry. No NR equivalent exists. Each Next.js App Router navigation is invisible to NR Browser.

## Affected Files

| File                            | Issue                                              |
| ------------------------------- | -------------------------------------------------- |
| `src/instrumentation-client.ts` | Missing NR `onRouterTransitionStart` hook          |
| `src/types/globals.d.ts`        | Missing `window.newrelic` type declaration         |
| Vercel environment              | Missing `NEW_RELIC_BROWSER_SNIPPET_BASE64` env var |

## Status

- [ ] Flow trace
- [ ] Runtime review
- [ ] Architecture review
- [ ] Remediation plan
- [ ] Implementation
- [ ] Validation
