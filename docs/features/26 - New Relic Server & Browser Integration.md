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

## Why Official NR Documentation Does Not Apply Here

> **Read this before making any changes to New Relic integration.**

The official New Relic documentation for Next.js and Node.js APM assumes one or more of the following that do **not** hold on Vercel with Next.js 16:

| Official recommendation                               | Why it breaks here                                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_OPTIONS=-r newrelic` preload                    | Crashes the Vercel remote builder before `node_modules` is available. Tested and permanently rejected in task `2026-04-08-vercel-newrelic-incident`.                       |
| Inject browser snippet via `getBrowserTimingHeader()` | Requires a connected APM agent with an active transaction. Calling it from `layout.tsx` triggers Next.js 16 prerender dynamic-access errors (`Date.now()` before request). |
| Store snippet in an environment variable              | The NR SPA snippet is ~88 KB. Vercel enforces a 64 KB per-variable limit. The variable approach was tested and permanently rejected in task `2026-04-05-nr-browser-spa`.   |
| Use route handler to serve browser snippet            | Creates a double-hop: `afterInteractive → fetch route → createElement('script') → CDN`. Adds 3–8 s latency and misses all page load timing events.                         |
| `script strategy="afterInteractive"` for the agent    | The NR SPA agent must load before React hydration to capture LCP, FCP, TTFB, and initial XHR. `afterInteractive` fires after hydration — all lifecycle events are missed.  |
| `nr-spa-X.min.js` as the agent URL                    | This file is a webpack module chunk, not a standalone agent. Without the loader runtime it silently stores modules in an array and never executes. Zero beacon requests.   |
| `allowTransactionlessInjection: true` in APM header   | Overrides the `isConnected()` guard. On hard refresh, the SPA agent initializes without a linked transaction, crashing the harvest serializer with `undefined[0]`.         |

**The only working approach for Next.js 16 on Vercel**:

- **Browser**: Inline `NREUM` config + `<Script strategy="beforeInteractive">` pointing directly to the versioned `nr-loader-spa-X.min.js` CDN URL
- **Server APM**: Late-load via `instrumentation.ts` (partial features, no full transaction tracing)
- **Logs**: Vercel log drain integration
- **Traces**: Vercel OTel integration (Beta)

This is not a limitation of the boilerplate — it is a platform constraint imposed by Vercel's serverless architecture and Next.js 16's `cacheComponents: true` prerender model.

---

## Browser Monitoring — CDN Standalone Agent

### How it works

Browser monitoring is delivered via the **New Relic Browser standalone CDN agent**, completely independent of the APM Node.js agent.

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

> **Why not `afterInteractive`?** The previous implementation used `afterInteractive`, causing the agent to load 3–8 seconds after navigation — after all meaningful lifecycle events had already fired. No page load data was captured.

### Why inline config + direct CDN

> **Why not a route handler?** The previous implementation routed CDN initialization through `/observability/new-relic-browser.js`, which created a `<script>` element pointing to the CDN — a double-hop:
>
> ```text
> afterInteractive → fetch route → parse IIFE → createElement('script') → fetch CDN agent
> ```
>
> This added 3–8 s latency and was incompatible with `beforeInteractive`. The fix: inject the config **inline** and point **directly** to the NR CDN agent URL.

### Why `NREUM.init` is required

The NR Browser CDN agent requires `NREUM.init` to configure:

- `distributed_tracing.enabled` — links browser sessions to backend APM traces
- `privacy.cookies_enabled` — controls session cookie behaviour
- `ajax.deny_list: ["bam.nr-data.net"]` — prevents the agent from instrumenting its own beacon calls

Without `NREUM.init` the agent uses internal defaults that may not match the NR application settings.

### `agentID` vs `applicationID` — Two Separate Fields

The NR Browser snippet contains two **distinct** numeric IDs that serve different purposes:

| Field           | Config Key                         | Env Var                            | Purpose                                              |
| --------------- | ---------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `agentID`       | `NEW_RELIC_BROWSER_APP_ID`         | `NEW_RELIC_BROWSER_APP_ID`         | Identifies the agent instance in `loader_config`     |
| `applicationID` | `NEW_RELIC_BROWSER_APPLICATION_ID` | `NEW_RELIC_BROWSER_APPLICATION_ID` | Identifies the application for data ingest in `info` |

These values are **different numbers** in NR's JS snippet (e.g. `agentID: "538838547"`, `applicationID: "421415380"`). Using the same value for both fields corrupts beacon attribution.

**How to get both values**: NR UI → Browser app → **Application settings** → **Copy/Paste JavaScript snippet**. Look for:

```javascript
NREUM.loader_config = { agentID: "XXXXX", ... }
NREUM.info = { applicationID: "YYYYY", ... }
```

Set `NEW_RELIC_BROWSER_APP_ID=XXXXX` and `NEW_RELIC_BROWSER_APPLICATION_ID=YYYYY`.

If `NEW_RELIC_BROWSER_APPLICATION_ID` is not set, it falls back to `NEW_RELIC_BROWSER_APP_ID`. This is only acceptable when the NR account has the same value for both fields (rare).

### Why `NEW_RELIC_BROWSER_AGENT_URL` must be versioned

The NR CDN **only serves versioned files**. There is no unversioned `latest` alias — unversioned URLs return **403 Forbidden**.

> **Critical file name distinction**:
>
> - `nr-loader-spa-X.min.js` — ✅ **correct**: standalone loader that bootstraps the webpack runtime and fetches `nr-spa-X.min.js` as a chunk
> - `nr-spa-X.min.js` — ❌ **wrong**: a webpack module chunk that requires the loader runtime; loading it directly results in zero beacon requests (silent failure)

Copy the URL from NR UI → Browser app → **Application settings** → **Copy/Paste JavaScript snippet** → `<script src="...">`.

### Setting up a NR Browser application

1. NR UI → **Browser** → **Add application**
2. Select **Copy/Paste JavaScript snippet** as the deployment method
3. Name it descriptively (see Per-Environment Setup below)
4. In **Application settings** → set **Browser agent type** to **Pro + SPA** for full SPA monitoring (not rum/lite)
5. From the generated snippet, extract:
   - `loader_config.agentID` → `NEW_RELIC_BROWSER_APP_ID`
   - `info.applicationID` → `NEW_RELIC_BROWSER_APPLICATION_ID`
   - `loader_config.licenseKey` → `NEW_RELIC_BROWSER_LICENSE_KEY`
   - `<script src="...">` → `NEW_RELIC_BROWSER_AGENT_URL`

### Per-Environment Entity Setup

> **Why you need separate NR Browser apps per environment**: A single browser app ID receives data from all environments simultaneously. Without separation, local dev, preview, and production beacon traffic all appear in the same NR entity, making it impossible to distinguish signal from noise.

Create **one NR Browser application per deployment environment**:

| Environment | Suggested NR entity name               | Vercel config target |
| ----------- | -------------------------------------- | -------------------- |
| Production  | `nextjs-16-boilerplate-browser`        | Production env vars  |
| Preview     | `nextjs-16-boilerplate-preview`        | Preview env vars     |
| Local dev   | `nextjs-16-boilerplate-dev` (optional) | `.env.local`         |

Each entity has its own `agentID`, `applicationID`, `licenseKey`, and agent URL. Set the corresponding `NEW_RELIC_BROWSER_*` env vars per Vercel environment target.

**Renaming NR Browser entities**: The entity display name shown in NR Entities (e.g. `beacon:421415380`) is **not** controlled by `NEW_RELIC_APP_NAME`. That env var applies to the Node.js APM agent only. To rename a Browser entity, use NR UI → **Browser** → select entity → **inline name edit** in the entity header (not in Application Settings).

### CSP requirements for CDN mode

The following domains are already in `src/security/middleware/with-headers.ts`:

- `script-src` / `script-src-elem`: `https://js-agent.newrelic.com` ✓
- `connect-src`: `https://bam.nr-data.net`, `https://bam.eu01.nr-data.net` ✓

---

## APM Route Handler — Local Dev Fallback

The route `/observability/new-relic-browser.js` serves the **APM-linked browser timing header** for local development only, where the NR Node.js agent can connect properly.

**File**: `src/app/observability/new-relic-browser.js/route.ts`

This route:

- Calls `await connection()` to opt into dynamic rendering under `cacheComponents: true`
- Returns `getBrowserAgentScriptSafe()` when the agent is connected
- Returns an empty `application/javascript` response when the agent is not connected (Vercel)
- Logs `console.info` on Vercel (expected) vs `console.warn` locally (actionable)

**On Vercel**: Always returns empty because the APM agent never fully connects. This is expected when CDN mode is active.

**Layout integration**: The APM route is only requested when `NEW_RELIC_ENABLED=true && NEW_RELIC_LICENSE_KEY` is set **and** CDN mode is NOT active. In practice, CDN mode takes precedence on all deployed environments.

---

## Server APM — `instrumentation.ts`

### Current state

The NR Node.js APM agent is loaded via `src/instrumentation.ts` → `src/monitoring/server-init.ts`:

```typescript
if (process.env.NEXT_RUNTIME === 'nodejs') {
  await import('./monitoring/server-init').then((m) =>
    m.initializeServerObservability(),
  );
}
```

`initializeServerObservability()` calls `require('newrelic')` when `NEW_RELIC_ENABLED=true` and `NEW_RELIC_LICENSE_KEY` is present.

### What works on Vercel via `instrumentation.ts`

| Feature                                  | Works?     | Notes                                                               |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------- |
| Custom attributes (`addCustomAttribute`) | ⚠️ Partial | Requires agent connection — happens on warm invocations only        |
| Custom segments (`startSegment`)         | ⚠️ Partial | Same connectivity requirement                                       |
| Error tracking                           | ⚠️ Partial | Sentry (`instrumentation.ts`) is more reliable for this purpose     |
| Full HTTP transaction tracing            | ❌ No      | Requires `--require newrelic` preload (crashes Vercel builder)      |
| `getBrowserTimingHeader()`               | ❌ No      | Requires connected agent + active transaction (not reliably Vercel) |

### Why `NODE_OPTIONS=-r newrelic` cannot be used on Vercel

`NODE_OPTIONS=-r newrelic` was tested and **permanently rejected** in task `2026-04-08-vercel-newrelic-incident`:

- Crashes the Vercel remote builder before `node_modules` is installed
- Repo-local preload paths are not resolved at Vercel builder bootstrap time

Do NOT re-introduce `NODE_OPTIONS` for NR preloading. This is a Vercel platform constraint.

### APM is already in place — no code changes needed

`instrumentation.ts` already loads the NR agent. The current setup is the best achievable without `NODE_OPTIONS`. If full transaction tracing from Vercel is required in the future:

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

Set `NEW_RELIC_LOG_DRAIN_ENABLED=true` in env to document the expected state (informational only — the actual drain is configured in the Vercel UI).

---

## Module Architecture

```
src/core/observability/new-relic.ts            — APM facade (lazy require, server-only)
src/core/observability/new-relic-browser.ts    — CDN config generator (server-only)
src/app/observability/new-relic-browser.js/    — APM fallback route (local dev only)
  route.ts
src/app/layout.tsx                             — CDN injection (head, beforeInteractive)
src/monitoring/server-init.ts                  — APM bootstrap (instrumentation.ts only)
newrelic.js                                    — NR agent config (app_name, logging)
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

| Variable                           | Type      | Default | Description                                                                                                                                                                                                  |
| ---------------------------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEW_RELIC_BROWSER_ENABLED`        | `boolean` | `false` | Enable CDN browser mode                                                                                                                                                                                      |
| `NEW_RELIC_BROWSER_LICENSE_KEY`    | `string`  | —       | Browser app license key from NR UI (not the APM license key — a different value)                                                                                                                             |
| `NEW_RELIC_BROWSER_APP_ID`         | `string`  | —       | Numeric entity ID — used as both `agentID` and `applicationID` for standalone browser apps                                                                                                                   |
| `NEW_RELIC_BROWSER_APPLICATION_ID` | `string`  | —       | **Rarely needed.** Set only when NR snippet shows `agentID !== applicationID` (APM-linked apps). Never set to "All Environments" in Vercel — always scope to specific environment. Omit for standalone apps. |
| `NEW_RELIC_BROWSER_ACCOUNT_ID`     | `string`  | —       | Your NR account ID (numeric, e.g. `6443682`)                                                                                                                                                                 |
| `NEW_RELIC_BROWSER_AGENT_URL`      | `url`     | —       | Versioned CDN URL — must be `nr-loader-spa-X.min.js`, not `nr-spa-X.min.js`                                                                                                                                  |

### APM (server-side)

| Variable                | Type      | Default                 | Description                                                                      |
| ----------------------- | --------- | ----------------------- | -------------------------------------------------------------------------------- |
| `NEW_RELIC_ENABLED`     | `boolean` | `false`                 | Enable APM agent loading                                                         |
| `NEW_RELIC_LICENSE_KEY` | `string`  | —                       | APM ingest license key                                                           |
| `NEW_RELIC_APP_NAME`    | `string`  | `nextjs-16-boilerplate` | APM application name (Node.js agent only — does not affect Browser entity names) |
| `NODE_OPTIONS`          | `string`  | _(blank)_               | **Must remain blank on Vercel** — do not set to `-r newrelic`                    |

### Operational / documentation flags

| Variable                      | Type      | Default | Description                                       |
| ----------------------------- | --------- | ------- | ------------------------------------------------- |
| `NEW_RELIC_LOG_DRAIN_ENABLED` | `boolean` | `false` | Documents active log drain (Vercel integration)   |
| `NEW_RELIC_OTEL_ENABLED`      | `boolean` | `false` | Documents active OTel traces (Vercel integration) |

---

## Troubleshooting

### Browser: No PageView events in NR after deploy

1. Verify all `NEW_RELIC_BROWSER_*` env vars are set in the correct Vercel environment target
2. DevTools → **Elements** → `<head>` — confirm inline NREUM config script is present
3. DevTools → **Network** — confirm `nr-loader-spa-*.min.js` loads with **200** (the loader then fetches `nr-spa-*.min.js` as a chunk — this is expected)
4. DevTools → **Console** — no CSP errors, no NR init errors
5. Wait 2–5 minutes — NR has ingest latency
6. Verify **Browser agent type** is **Pro + SPA** in NR UI Application settings (not rum/lite)

### Browser: 403 on CDN agent URL

The NR CDN only serves versioned files. Unversioned URLs return 403. Copy the correct versioned `nr-loader-spa-X.min.js` URL from NR UI → Browser app → Application settings → Copy/Paste snippet.

### Browser: `NREUM` config missing from `<head>`

`getNrBrowserCdnConfig()` returns `null` when any required var is unset. All five `NEW_RELIC_BROWSER_*` vars must be set: `ENABLED`, `LICENSE_KEY`, `APP_ID`, `ACCOUNT_ID`, `AGENT_URL`.

### Browser: Data arrives in wrong NR entity / mixed environments (preview data in local entity)

**Cause**: `NEW_RELIC_BROWSER_APPLICATION_ID` is set to "All Environments" in Vercel. This overrides the per-env `APP_ID` fallback and routes all beacon traffic to a single entity.

**Fix**: Delete `NEW_RELIC_BROWSER_APPLICATION_ID` from Vercel entirely (for standalone browser apps). The fallback `applicationID = APP_ID` will then use the correct per-environment entity:

- Production (`APP_ID=538837591`) → production entity ✓
- Preview (`APP_ID=538838564`) → preview entity ✓

Only set `NEW_RELIC_BROWSER_APPLICATION_ID` if the NR snippet for a specific entity shows `agentID !== applicationID`, and set it **per-environment** (not "All Environments").

### APM: `connected=false` in Vercel logs

Expected on cold starts. The NR agent connects asynchronously after boot. The log line `[New Relic] Server init loaded connected=false` is normal on Vercel — it does not affect browser monitoring.

### APM: No Transaction events in NR from Vercel

Expected. Full HTTP transaction tracing requires `NODE_OPTIONS=-r newrelic` which crashes the Vercel builder. Use Sentry for error tracking and the Vercel log drain for log-level observability.

### APM: `[NR Browser] Empty script` warning in route logs

On Vercel, the APM route always returns empty because the APM agent never fully connects. The warning is downgraded to `console.info` on Vercel. No action needed when CDN mode is active.

### APM: EROFS crash on startup

`newrelic.js` must have `logging: { filepath: 'stdout' }`. Without it the agent crashes trying to write to Vercel's read-only filesystem. This is already set in `newrelic.js`.

---

## Guardrails

- **Do NOT** set `NODE_OPTIONS=-r newrelic` on Vercel — it crashes the builder.
- **Do NOT** use `NEW_RELIC_BROWSER_SNIPPET` or `NEW_RELIC_BROWSER_SNIPPET_BASE64` env vars — snippet is ~88 KB, exceeds Vercel's 64 KB per-variable limit.
- **Do NOT** call `getBrowserTimingHeader()` from `layout.tsx` or any prerenderable RSC — triggers Next.js 16 prerender dynamic-access error via `Date.now()` inside the NR agent.
- **Do NOT** use `nr-spa.min.js` or `nr-spa-X.min.js` as the CDN agent URL — the `nr-spa` file is a webpack chunk that requires the loader runtime; loading it directly produces zero beacon requests.
- **Do NOT** use `nr-loader-spa-X.min.js` without also setting `NREUM.init` inline — the agent will use unsafe internal defaults.
- **Do NOT** pass `allowTransactionlessInjection: true` to `nr.getBrowserTimingHeader()` — overrides the `isConnected()` guard, causing the SPA harvest serializer to crash with `TypeError: Cannot read properties of undefined (reading '0')` on hard refresh.
- **Do NOT** import `newrelic` directly in features, modules, or UI components — all APM usage goes through `src/core/observability/new-relic.ts`.
- **Do NOT** move CDN delivery back through a route handler — reintroduces double-hop loading and breaks `beforeInteractive` strategy.
- **Do NOT** set `strategy="afterInteractive"` for the CDN agent — misses page load timing events.
- **Do NOT** set `NEW_RELIC_BROWSER_APPLICATION_ID` to "All Environments" in Vercel — this routes all beacon traffic to a single NR entity, breaking environment isolation. Always set it per-environment (Production, Preview separately).
- **Do NOT** share one NR Browser entity across Vercel Production and Preview — use separate entities with separate env var sets per Vercel environment target.
- **Do NOT** attempt to rename Browser entities via `NEW_RELIC_APP_NAME` — that env var controls only the APM Node.js agent name. Browser entity names are edited directly in the NR UI entity header.

---

## NerdGraph Debug Scripts

For local operational inspection:

```shell
pnpm nr -- list
pnpm nr -- run baseline
pnpm nr -- run baseline --view=compact
pnpm nr -- run golden-signals
pnpm nr:query -- "SELECT count(*) FROM PageView SINCE 1 hour ago"
pnpm nr:query -- "SELECT count(*) FROM Transaction SINCE 1 hour ago"
```

These scripts use `NEW_RELIC_USER_API_KEY` (NerdGraph user key), not the APM license key. Local-only — not exposed to any runtime code.

---

## Prior Investigation Tasks

| Task                                      | Finding                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-04-05-nr-browser-spa`               | NR Browser SPA snippet ~88 KB exceeds Vercel 64 KB env var limit — env var approach permanently rejected                                                                                                                                              |
| `2026-04-08-vercel-newrelic-incident`     | `NODE_OPTIONS=-r newrelic` crashes Vercel builder — permanently rejected; late load via `instrumentation.ts` misses HTTP transaction context                                                                                                          |
| `2026-04-12-vercel-nr-proper-integration` | Decision: CDN standalone browser agent, Vercel log drain, OTel traces; APM deferred                                                                                                                                                                   |
| `2026-04-13` (chat `80f77b48`)            | Root cause of CDN failure: wrong script strategy (`afterInteractive`), double-hop architecture, missing `NREUM.init`, invalid unversioned CDN URL (403) — all fixed                                                                                   |
| `2026-04-16` (chat `2a857370`)            | `agentID` vs `applicationID` split corrected (`NEW_RELIC_BROWSER_APPLICATION_ID` added); `nr-loader-spa` vs `nr-spa` webpack chunk distinction documented; `allowTransactionlessInjection` ban confirmed; per-environment entity setup guidance added |
