# Flow Trace Investigation

**Step**: 2 — Flow Trace Investigation
**Agent**: Debug Investigation Agent
**Date**: 2026-04-13
**Status**: complete

---

## Execution Path — CDN Mode

### Step A: Layout Render (Server Component)

**File**: `src/app/layout.tsx`

```typescript
const isNewRelicCdnBrowserEnabled =
  env.NEW_RELIC_BROWSER_ENABLED && // boolean from env
  Boolean(env.NEW_RELIC_BROWSER_LICENSE_KEY) && // optional string
  Boolean(env.NEW_RELIC_BROWSER_APP_ID); // optional string
```

**If true**: `<Script id="nr-browser-agent" src="/observability/new-relic-browser.js" strategy="afterInteractive" />` is emitted into `<head>`.

**Timing concern**: With `cacheComponents: true`, the Root Layout may be prerendered. The prerender evaluates `env.*` at prerender time (typically build time or first request in ISR mode). If env vars are set in Vercel, they ARE available at build/prerender time. If not set → condition is `false` → no `<Script>` tag → nothing loads.

### Step B: Browser Fetches `/observability/new-relic-browser.js`

**File**: `src/app/observability/new-relic-browser.js/route.ts`

Triggered: `strategy="afterInteractive"` → browser fetches this URL AFTER the page is interactive (React has hydrated, first user interactions possible).

**Timing problem identified**: A monitoring agent MUST load before the first user interaction. `afterInteractive` is the wrong strategy for instrumentation.

Route execution:

1. `await connection()` — opts into dynamic rendering ✓
2. Checks `env.NEW_RELIC_BROWSER_ENABLED && env.NEW_RELIC_BROWSER_LICENSE_KEY && env.NEW_RELIC_BROWSER_APP_ID` → returns `getNrBrowserCdnSnippet()`

### Step C: `getNrBrowserCdnSnippet()` Returns JS

**File**: `src/core/observability/new-relic-browser.ts`

Returns a JS string containing:

```javascript
(function () {
  var NREUM = window.NREUM || {};
  window.NREUM = NREUM;
  NREUM.loader_config = {
    accountID,
    trustKey,
    agentID,
    licenseKey,
    applicationID,
  };
  NREUM.info = { beacon, errorBeacon, licenseKey, applicationID, sa: 1 };
  var s = document.createElement('script');
  s.src = 'https://js-agent.newrelic.com/nr-spa.min.js';
  document.head.appendChild(s);
})();
```

### Step D: Browser Executes the Snippet

The browser executes the IIFE from the route:

- Sets `NREUM.loader_config` and `NREUM.info`
- Creates a `<script>` element pointing to `https://js-agent.newrelic.com/nr-spa.min.js`
- Appends to `document.head`

**Second timing problem**: The NR agent is now loading via a DYNAMIC script element created by an `afterInteractive` script. The NR agent download starts at: `page_load_time + react_hydration_time + route_fetch_time + script_parse_time + dynamic_script_fetch_time`. This is 3-5 seconds after navigation minimum.

### Step E: `nr-spa.min.js` Loads

The NR Browser SPA agent downloads and executes from `https://js-agent.newrelic.com/nr-spa.min.js`. It reads `NREUM.loader_config` and `NREUM.info` from the window. **Critical issue: `NREUM.init` is absent.** The `init` object configures distributed tracing, cookie behavior, and Ajax deny lists. Without it, the agent uses defaults that may differ from expected behavior.

### Step F: NR Agent Tries to Record First PageView

At this point the agent attempts to instrument the page, but:

- Page was already interactive for several seconds
- React has already hydrated
- Initial network requests already completed
- First paint / FCP / LCP already fired
- Performance timing for initial load is partially or fully lost

---

## Divergence Points Identified

| #   | Location               | Issue                                                       | Severity     |
| --- | ---------------------- | ----------------------------------------------------------- | ------------ |
| D1  | `layout.tsx`           | `strategy="afterInteractive"` for a monitoring agent        | **Critical** |
| D2  | `new-relic-browser.ts` | Double-hop: route JS → dynamic `<script>` creation          | **Critical** |
| D3  | `new-relic-browser.ts` | Missing `NREUM.init` object                                 | **High**     |
| D4  | `layout.tsx`           | No `NREUM.init` config injected before agent script         | **High**     |
| D5  | `layout.tsx`           | Env var check at prerender time may silently disable NR     | **Medium**   |
| D6  | `new-relic-browser.ts` | Unversioned `nr-spa.min.js` URL (no canonical version lock) | **Low**      |

---

## Identity / Tenant Context

Not applicable — browser monitoring does not carry user-identity context in this implementation.

---

## Summary of Likely Root Cause

The CDN approach fails because it uses the wrong loading architecture:

- It routes through a Next.js route handler that serves JS
- That JS uses dynamic script injection (`document.createElement('script')`)
- The outer script is loaded `afterInteractive` (already wrong)
- The inner dynamic script adds another hop
- The NR agent ends up loading several seconds after page load, after all the lifecycle events it should instrument have already fired
- Additionally, the `NREUM.init` configuration object is absent, which may cause agent malfunction even if timing were corrected
