# Remediation Plan

**Step**: 5 — Remediation Plan
**Agent**: Debug Investigation Agent
**Date**: 2026-04-13
**Status**: approved — ready for implementation

---

## Root Cause (Confirmed)

The NR Browser CDN agent fails on Vercel due to **three compounding issues**:

### Root Cause 1 — Wrong Script Loading Strategy (Critical)

`layout.tsx` loads the NR monitoring script with `strategy="afterInteractive"`. This means the NR agent loads **after React hydration**, missing:

- Page load timing (LCP, FCP, TTFB)
- Initial XHR/Fetch requests
- JavaScript errors during hydration
- The first `PageView` event with accurate timing

A monitoring/telemetry agent **must** load with `strategy="beforeInteractive"` (before hydration) or as a blocking `<script>` in `<head>`.

### Root Cause 2 — Double-Hop Loading Architecture (Critical)

The current implementation:

1. Layout → `<Script src="/observability/new-relic-browser.js" strategy="afterInteractive">` (browser fetches the route)
2. Route handler returns a JS snippet
3. That snippet executes and creates ANOTHER `<script>` element pointing to `https://js-agent.newrelic.com/nr-spa.min.js`
4. Browser fetches the actual NR agent

This means the NR agent loads at: `T_interactive + T_route_fetch + T_snippet_parse + T_cdn_fetch`. On Vercel with cold starts, this is 3–8 seconds after navigation. The NR agent has already missed everything meaningful.

**Correct architecture**: The NR CDN URL should be in the `<Script src>` directly, not inside another JS file that creates a dynamic element.

### Root Cause 3 — Missing `NREUM.init` Object (High)

The NR Browser CDN agent v1.x requires `NREUM.init` to configure:

- `distributed_tracing.enabled` — links browser traces to backend APM traces
- `privacy.cookies_enabled` — controls session tracking
- `ajax.deny_list` — prevents instrumentation of NR's own beacons (prevents infinite loops)

Without `NREUM.init`, the agent uses internal defaults that may not match the NR application settings and will log warnings.

---

## Fix — Three-Part Change

### Change 1: `src/core/observability/new-relic-browser.ts` — Add config object export

Add a new exported function `getNrBrowserCdnConfig()` that returns the typed config object (not a JS script string). The dynamic script injection IIFE is removed. The `getNrBrowserCdnSnippet()` function is updated to include `NREUM.init` and return a proper inline config string (for the route handler APM fallback path, if needed).

**New export**:

```typescript
export interface NrBrowserCdnConfig {
  accountId: string;
  appId: string;
  licenseKey: string;
  init: {
    distributed_tracing: { enabled: boolean };
    privacy: { cookies_enabled: boolean };
    ajax: { deny_list: string[] };
  };
}

export function getNrBrowserCdnConfig(): NrBrowserCdnConfig | null;
```

### Change 2: `src/app/layout.tsx` — Direct CDN injection

**Remove**: `<Script src="/observability/new-relic-browser.js" strategy="afterInteractive">` for the CDN case.

**Add** for CDN mode:

```tsx
{
  isNewRelicCdnBrowserEnabled && (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.NREUM||(NREUM={});NREUM.init=${JSON.stringify(cdnConfig.init)};NREUM.loader_config={accountID:${JSON.stringify(cdnConfig.accountId)},trustKey:${JSON.stringify(cdnConfig.accountId)},agentID:${JSON.stringify(cdnConfig.appId)},licenseKey:${JSON.stringify(cdnConfig.licenseKey)},applicationID:${JSON.stringify(cdnConfig.appId)}};NREUM.info={beacon:"bam.nr-data.net",errorBeacon:"bam.nr-data.net",licenseKey:${JSON.stringify(cdnConfig.licenseKey)},applicationID:${JSON.stringify(cdnConfig.appId)},sa:1};`,
        }}
      />
      <Script
        id="nr-browser-cdn"
        src="https://js-agent.newrelic.com/nr-spa.min.js"
        strategy="beforeInteractive"
      />
    </>
  );
}
```

**Keep** (for APM-linked mode, local dev):

```tsx
{
  isNewRelicApmBrowserEnabled && (
    <Script
      id="nr-browser-agent"
      src="/observability/new-relic-browser.js"
      strategy="afterInteractive"
    />
  );
}
```

The APM-linked mode (served via route handler from `getBrowserTimingHeaderSafe()`) is fine with `afterInteractive` because it is only relevant on local dev where the APM agent connects, and on Vercel it returns empty anyway (APM deferred). The CDN mode is the path that needs to work on Vercel.

### Change 3: `src/app/observability/new-relic-browser.js/route.ts` — Remove CDN code path

The route handler's CDN branch (`if (env.NEW_RELIC_BROWSER_ENABLED) { const cdnSnippet = getNrBrowserCdnSnippet(); ... }`) becomes dead code once CDN injection moves to the layout. Remove it.

The route handler retains only the APM-linked path (`getBrowserAgentScriptSafe()`).

---

## Affected Files

| File                                                           | Change                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/core/observability/new-relic-browser.ts`                  | Add `getNrBrowserCdnConfig()`, update `getNrBrowserCdnSnippet()` |
| `src/app/layout.tsx`                                           | Replace `<Script>` CDN path with direct injection                |
| `src/app/observability/new-relic-browser.js/route.ts`          | Remove CDN branch                                                |
| `src/core/observability/new-relic-browser.test.ts`             | Update tests for new config shape                                |
| `src/app/observability/new-relic-browser.js/route.test.ts`     | Remove CDN test cases                                            |
| `docs/features/26 - New Relic Server & Browser Integration.md` | Update CDN delivery description                                  |

---

## Expected Behavior After Fix

1. NR Browser CDN mode: inline NREUM config + `<Script strategy="beforeInteractive">` pointing to NR CDN → agent loads before React hydration
2. First `PageView` recorded with accurate page load timing
3. XHR/Fetch requests from initial page render instrumented
4. JavaScript errors captured from the start
5. `/observability/new-relic-browser.js` route still serves APM-linked snippet for local dev (returns empty on Vercel — this is expected and already logged as `console.info`)

---

## Risks

| Risk                                                   | Likelihood | Mitigation                                                    |
| ------------------------------------------------------ | ---------- | ------------------------------------------------------------- |
| `beforeInteractive` script blocks page render slightly | Low        | Acceptable trade-off; NR CDN is fast and edge-cached          |
| CSP blocks the `beforeInteractive` script              | None       | `script-src` already includes `https://js-agent.newrelic.com` |
| `dangerouslySetInnerHTML` CSP issue                    | None       | `unsafe-inline` already present                               |
| NR agent not loading correct application               | Low        | Verify `accountId`, `appId`, `licenseKey` in Vercel dashboard |
| `nr-spa.min.js` unversioned URL                        | Low        | NR maintains this as a stable latest pointer                  |

---

## Deferred

- Version-pinning of `nr-spa.min.js` (separate task if NR recommends a specific version)
- APM agent on Vercel (prior task decision, still deferred)
