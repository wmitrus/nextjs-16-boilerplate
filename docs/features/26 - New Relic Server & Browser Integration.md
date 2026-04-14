# New Relic Server & Browser Integration

## Overview

This repository integrates New Relic for both server-side APM and browser monitoring. The two concerns are **fully decoupled** — browser monitoring works independently of the APM Node.js agent.

| Concern                                | Mechanism                                          | Works on Vercel?          |
| -------------------------------------- | -------------------------------------------------- | ------------------------- |
| Browser monitoring                     | CDN standalone agent (`NEW_RELIC_BROWSER_ENABLED`) | ✅ Yes                    |
| Server APM (custom attributes, errors) | `instrumentation.ts` late-load                     | ⚠️ Partial                |
| Server APM (full HTTP transactions)    | `NODE_OPTIONS=-r newrelic` preload                 | ❌ Crashes Vercel builder |
| Log forwarding                         | Vercel log drain integration                       | ✅ Yes                    |
| Distributed traces                     | Vercel OTel traces (Beta)                          | ✅ Yes (experimental)     |

---

## Browser Monitoring — CDN Standalone Agent (Primary Path)

### How it works

Browser monitoring is delivered via the **New Relic Browser standalone CDN agent**, completely independent of the APM Node.js agent. This is the only reliable browser monitoring path on Vercel.

The root layout (`src/app/layout.tsx`) injects two items directly into `<head>` when CDN mode is configured:

1. An **inline `<script>`** that sets the NREUM configuration object (`loader_config`, `info`, `init`)
2. A **`<Script strategy="beforeInteractive">`** pointing directly to the versioned NR CDN agent URL

```tsx
{
  cdnConfig && (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.NREUM||(NREUM={});NREUM.init=...;NREUM.loader_config=...;NREUM.info=...;`,
        }}
      />
      <Script
        id="nr-browser-cdn"
        src={cdnConfig.agentUrl}
        strategy="beforeInteractive"
      />
    </>
  );
}
```

### Why `beforeInteractive`

Browser monitoring agents must load **before React hydration** to capture:

- Page load timing (LCP, FCP, TTFB)
- Initial XHR/Fetch requests
- JavaScript errors during bootstrap
- The first `PageView` with accurate timing

`afterInteractive` (the previous approach) caused the agent to load 3–8 seconds after navigation — after all meaningful lifecycle events had already fired.

### Why inline config + direct CDN (not a route handler)

The previous implementation routed CDN initialization through `/observability/new-relic-browser.js`, which returned a JS file that dynamically created a second `<script>` element pointing to the NR CDN. This caused a **double-hop loading problem**:

```
afterInteractive → fetch route handler → parse IIFE → createElement('script') → fetch CDN agent
```

The fix: the layout injects the NREUM config **inline** and points **directly** to the NR CDN agent URL. Zero intermediate hops.

### Why `NREUM.init` is required

The NR Browser CDN agent requires `NREUM.init` to configure:

- `distributed_tracing.enabled` — links browser sessions to backend APM traces
- `privacy.cookies_enabled` — controls session cookie behaviour
- `ajax.deny_list: ["bam.nr-data.net"]` — prevents the agent from instrumenting its own beacon calls (avoids infinite loops)

Without `NREUM.init` the agent uses internal defaults that may not match the NR application settings.

### Why `NEW_RELIC_BROWSER_AGENT_URL` is required

The NR CDN **only serves versioned files**. There is no publicly accessible unversioned `latest` alias — an unversioned URL (e.g. `nr-spa.min.js`) returns **403 Forbidden**. The correct versioned URL must be copied from the NR UI.

### Required env vars for CDN browser mode

| Variable                        | Description                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NEW_RELIC_BROWSER_ENABLED`     | `true` to enable CDN mode                                                                       |
| `NEW_RELIC_BROWSER_LICENSE_KEY` | Browser application license key (from NR UI Browser app settings — **not** the APM license key) |
| `NEW_RELIC_BROWSER_APP_ID`      | Numeric application ID (from NR UI Browser app settings)                                        |
| `NEW_RELIC_BROWSER_ACCOUNT_ID`  | Your NR account ID (e.g. `6443682`)                                                             |
| `NEW_RELIC_BROWSER_AGENT_URL`   | Versioned CDN URL — see below                                                                   |

### How to get `NEW_RELIC_BROWSER_AGENT_URL`

1. In NR UI → **Browser** → your app → **Application settings**
2. Select **Copy/Paste JavaScript snippet**
3. Find the `<script src="...">` line
4. Copy the full URL, e.g.: `https://js-agent.newrelic.com/nr-spa-1.312.1.min.js`
5. Set it as `NEW_RELIC_BROWSER_AGENT_URL` in Vercel and `.env.local`

### Setting up a NR Browser application

1. NR UI → **Browser** → **Add application**
2. Select **Copy/Paste JavaScript snippet** as the deployment method
3. Name it (e.g. `nextjs-16-boilerplate-browser`)
4. Copy the `licenseKey` and `applicationID` values from the generated snippet
5. In **Application settings** → set **Browser agent type** to **Pro + SPA** for full SPA monitoring
6. Copy the `<script src="...">` URL for `NEW_RELIC_BROWSER_AGENT_URL`

### CSP requirements for CDN mode

The following domains are already in `src/security/middleware/with-headers.ts`:

- `script-src` / `script-src-elem`: `https://js-agent.newrelic.com` ✓
- `connect-src`: `https://bam.nr-data.net`, `https://bam.eu01.nr-data.net` ✓

---

## APM Route Handler — Local Dev Fallback

The route `/observability/new-relic-browser.js` still exists and serves the **APM-linked browser timing header** for local development, where the NR Node.js agent connects properly.

**File**: `src/app/observability/new-relic-browser.js/route.ts`

This route:

- Calls `await connection()` to opt into dynamic rendering under `cacheComponents: true`
- Returns `getBrowserAgentScriptSafe()` — the APM-linked timing header — when the agent is connected
- Returns an empty `application/javascript` response when the agent is not connected (Vercel)
- Logs `console.info` on Vercel (expected, not an error) vs `console.warn` locally (actionable)

**On Vercel**: This route always returns empty because the APM agent never fully connects (see APM section below). This is expected and not an error when CDN mode is active.

**Layout integration**: The APM route is only loaded when `NEW_RELIC_ENABLED=true && NEW_RELIC_LICENSE_KEY` is set **and** CDN mode is NOT active. In practice, on Vercel with CDN mode configured, the APM route is never requested.

---

## Server APM — `instrumentation.ts`

### Current state

The NR Node.js APM agent is loaded via `src/instrumentation.ts` → `src/monitoring/server-init.ts`:

```typescript
// instrumentation.ts
if (process.env.NEXT_RUNTIME === 'nodejs') {
  await import('./monitoring/server-init').then((m) =>
    m.initializeServerObservability(),
  );
}
```

`initializeServerObservability()` calls `require('newrelic')` when `NEW_RELIC_ENABLED=true` and `NEW_RELIC_LICENSE_KEY` is present.

### What works on Vercel via `instrumentation.ts`

| Feature                                  | Works?     | Notes                                                          |
| ---------------------------------------- | ---------- | -------------------------------------------------------------- |
| Custom attributes (`addCustomAttribute`) | ⚠️ Partial | Requires agent to connect — happens on warm invocations        |
| Custom segments (`startSegment`)         | ⚠️ Partial | Same connectivity requirement                                  |
| Error tracking                           | ⚠️ Partial | Sentry (`instrumentation.ts`) is more reliable                 |
| Full HTTP transaction tracing            | ❌ No      | Requires `--require newrelic` preload (crashes Vercel builder) |
| `getBrowserTimingHeader()`               | ❌ No      | Requires connected agent + active transaction                  |

### Why `NODE_OPTIONS=-r newrelic` cannot be used on Vercel

`NODE_OPTIONS=-r newrelic` was **tested and permanently rejected** across two investigation tasks:

- Crashes the Vercel remote builder before `node_modules` is installed
- Repo-local preload paths are not resolved by Vercel's builder bootstrap

Do NOT re-introduce `NODE_OPTIONS` targeting the NR preload. This is a Vercel platform constraint, not a code issue.

### What changes with CDN browser active

**Before CDN**: APM was required for browser monitoring (via `getBrowserTimingHeader()`). APM failure on Vercel = no browser data.

**After CDN**: Browser monitoring is fully independent. APM can be enabled or disabled without affecting browser data. The value of APM on Vercel is limited to partial custom attributes/segments on warm invocations.

### APM is already in place — no code changes needed

`instrumentation.ts` already loads the NR agent. The current setup is the best achievable without `NODE_OPTIONS`. No changes to `instrumentation.ts` or `server-init.ts` are needed.

If full APM transaction tracing is required on Vercel in the future, the options are:

1. **`@vercel/otel` + NR OTLP endpoint** — OTel-native tracing forwarded to NR
2. **Vercel OTel traces (Beta)** — via the Vercel log drain integration UI
3. **Self-hosted deployment** — where `NODE_OPTIONS` works correctly

---

## Vercel Log Drain (Log Forwarding)

Configure via the Vercel marketplace integration — no code required:

1. NR UI → **Add Data** → search "Vercel" → **Add integration**
2. Connect Vercel account → select projects
3. Enter `NEW_RELIC_LICENSE_KEY`
4. Enable **Traces (Beta)** if OTel distributed tracing is desired

Set `NEW_RELIC_LOG_DRAIN_ENABLED=true` in env to document the expected state (informational only — the actual drain is configured in Vercel UI).

---

## Module Architecture

### Provider isolation

No feature, module, or UI delivery layer imports the `newrelic` SDK directly. All custom usage is behind `src/core/observability/new-relic.ts`:

```
src/core/observability/new-relic.ts       — APM facade (lazy require, server-only)
src/core/observability/new-relic-browser.ts — CDN config generator (server-only)
src/app/observability/new-relic-browser.js/route.ts — APM fallback route (local dev)
src/app/layout.tsx                        — CDN injection (head, beforeInteractive)
src/monitoring/server-init.ts             — APM bootstrap (instrumentation.ts only)
newrelic.js                               — NR agent config (app_name, logging)
```

### Dependency direction

```
layout.tsx → new-relic-browser.ts (CDN config, server component import)
instrumentation.ts → server-init.ts → require('newrelic') (APM bootstrap)
route handler → new-relic.ts → require('newrelic') (APM facade, local dev)
```

No cross-module boundary violations. All NR code stays in `src/core/observability/` and `src/monitoring/`.

---

## Environment Variables

### CDN Browser mode

| Variable                        | Type      | Default | Description                                                                    |
| ------------------------------- | --------- | ------- | ------------------------------------------------------------------------------ |
| `NEW_RELIC_BROWSER_ENABLED`     | `boolean` | `false` | Enable CDN browser mode                                                        |
| `NEW_RELIC_BROWSER_LICENSE_KEY` | `string`  | —       | Browser app license key (from NR UI, not APM key)                              |
| `NEW_RELIC_BROWSER_APP_ID`      | `string`  | —       | Numeric browser app ID                                                         |
| `NEW_RELIC_BROWSER_ACCOUNT_ID`  | `string`  | —       | NR account ID                                                                  |
| `NEW_RELIC_BROWSER_AGENT_URL`   | `url`     | —       | Versioned CDN URL (e.g. `https://js-agent.newrelic.com/nr-spa-1.312.1.min.js`) |

### APM (server-side)

| Variable                | Type      | Default                 | Description                                                   |
| ----------------------- | --------- | ----------------------- | ------------------------------------------------------------- |
| `NEW_RELIC_ENABLED`     | `boolean` | `false`                 | Enable APM agent loading                                      |
| `NEW_RELIC_LICENSE_KEY` | `string`  | —                       | APM ingest license key                                        |
| `NEW_RELIC_APP_NAME`    | `string`  | `nextjs-16-boilerplate` | APM application name                                          |
| `NODE_OPTIONS`          | `string`  | _(blank)_               | **Must remain blank on Vercel** — do not set to `-r newrelic` |

### Operational / documentation flags

| Variable                      | Type      | Default | Description                                       |
| ----------------------------- | --------- | ------- | ------------------------------------------------- |
| `NEW_RELIC_LOG_DRAIN_ENABLED` | `boolean` | `false` | Documents active log drain (Vercel integration)   |
| `NEW_RELIC_OTEL_ENABLED`      | `boolean` | `false` | Documents active OTel traces (Vercel integration) |

---

## Troubleshooting

### Browser: No PageView events in NR after deploy

1. Verify Vercel env vars are set: `NEW_RELIC_BROWSER_ENABLED=true`, all `NEW_RELIC_BROWSER_*` vars
2. Open browser DevTools → **Elements** → `<head>` — confirm inline NREUM config script is present
3. DevTools → **Network** — confirm `nr-spa-*.min.js` loads with **200** (not 403, not empty)
4. DevTools → **Console** — no CSP errors, no NR init errors
5. Wait 2–5 minutes — NR has ingest latency
6. Verify **Browser agent type** is **Pro + SPA** in NR UI (not rum/lite)

### Browser: 403 on CDN agent URL

The NR CDN only serves versioned files. An unversioned URL (`nr-spa.min.js`) returns 403. Get the correct versioned URL from NR UI → Browser app → Application settings → Copy/Paste snippet.

### Browser: `NREUM` config missing from `<head>`

`getNrBrowserCdnConfig()` returns `null` when any required var is unset. Check:

- `NEW_RELIC_BROWSER_ENABLED=true`
- `NEW_RELIC_BROWSER_LICENSE_KEY` is set
- `NEW_RELIC_BROWSER_APP_ID` is set
- `NEW_RELIC_BROWSER_AGENT_URL` is set and is a valid URL

### APM: `connected=false` in Vercel logs

Expected on cold starts. The NR agent connects asynchronously after boot. The log line `[New Relic] Server init loaded connected=false` is normal on Vercel — the agent has not yet completed the collector handshake at the time `instrumentation.ts` runs. This does not affect browser monitoring (CDN mode is independent).

### APM: No Transaction events in NR from Vercel

Expected. Full HTTP transaction tracing requires `NODE_OPTIONS=-r newrelic` which crashes the Vercel builder. APM transaction data from Vercel is not achievable with the current setup. Use Sentry for error tracking and the Vercel log drain for log-level observability.

### APM: `[NR Browser] Empty script` warning in route logs

On Vercel, the APM route (`/observability/new-relic-browser.js`) always returns empty because the APM agent never fully connects. This is expected when CDN mode is active — the warning is downgraded to `console.info` on Vercel. No action needed.

### APM: EROFS crash on startup

`newrelic.js` must have `logging: { filepath: 'stdout' }`. Without it the agent crashes trying to write a log file to Vercel's read-only filesystem. This is already set in the repository `newrelic.js`.

---

## Guardrails

- **Do NOT** set `NODE_OPTIONS=-r newrelic` on Vercel — it crashes the builder.
- **Do NOT** use `NEW_RELIC_BROWSER_SNIPPET` or `NEW_RELIC_BROWSER_SNIPPET_BASE64` env vars — removed, snippet is ~88 KB, exceeds Vercel's 64 KB per-variable limit.
- **Do NOT** call `getBrowserTimingHeader()` from `layout.tsx` or any prerenderable RSC — triggers Next.js prerender dynamic-access error.
- **Do NOT** use `nr-spa.min.js` (unversioned) as the CDN URL — returns 403.
- **Do NOT** import `newrelic` directly in features, modules, or UI components — use `src/core/observability/new-relic.ts`.
- **Do NOT** move CDN delivery back through a route handler — it reintroduces the double-hop timing problem.
- Keep `strategy="beforeInteractive"` for the CDN agent — `afterInteractive` causes the agent to miss page load timing.

---

## NerdGraph Debug Scripts

For local operational inspection and debugging:

```shell
pnpm nr -- list
pnpm nr -- run baseline
pnpm nr -- run baseline --view=compact
pnpm nr -- run golden-signals
pnpm nr:query -- "SELECT count(*) FROM PageView SINCE 1 hour ago"
pnpm nr:query -- "SELECT count(*) FROM Transaction SINCE 1 hour ago"
```

These scripts use a NerdGraph user API key (`NEW_RELIC_USER_API_KEY`), not the APM license key. They are local-only and not exposed to any runtime code.

---

## Prior Investigation Tasks

| Task                                      | Finding                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-04-05-nr-browser-spa`               | NR Browser SPA snippet ~88 KB exceeds Vercel 64 KB env var limit — env var approach permanently rejected                                                            |
| `2026-04-08-vercel-newrelic-incident`     | `NODE_OPTIONS=-r newrelic` crashes Vercel builder — permanently rejected; late load via `instrumentation.ts` misses HTTP transaction context                        |
| `2026-04-12-vercel-nr-proper-integration` | Decision: CDN standalone browser agent, Vercel log drain, OTel traces; APM deferred                                                                                 |
| `2026-04-13` (chat `80f77b48`)            | Root cause of CDN failure: wrong script strategy (`afterInteractive`), double-hop architecture, missing `NREUM.init`, invalid unversioned CDN URL (403) — all fixed |
