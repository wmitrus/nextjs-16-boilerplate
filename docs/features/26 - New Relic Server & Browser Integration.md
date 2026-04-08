# New Relic Server & Browser Integration

## Purpose

This document explains how New Relic is integrated in this repository for both server-side APM and browser monitoring, and why the browser path uses a request-time Node loader route instead of calling the New Relic browser API at layout render time.

## Root Cause Note — Hosted Vercel Runtime

New Relic's official Node.js install guidance for Next.js says the agent should be preloaded via `NODE_OPTIONS='--require newrelic'` at process start.

In this repository, forcing that preload through Vercel environment variables was tested and rejected:

- raw `NODE_OPTIONS='--require newrelic'` crashes the remote preview build before dependencies are installed
- repo-local preload file paths are not resolved reliably by Vercel's remote builder bootstrap

For this deployment model, `NODE_OPTIONS` should not be treated as a required New Relic configuration path.

## Critical Constraints — Read Before Changing Anything

### Snippet env var size limit — Vercel

The NR Browser SPA snippet is approximately 88 KB. Vercel documents a per-variable limit of 64 KB for Node deployments and 5 KB for Edge/Middleware.

Do NOT recommend or attempt to set `NEW_RELIC_BROWSER_SNIPPET_BASE64` or `NEW_RELIC_BROWSER_SNIPPET` as Vercel environment variables. It will not work and was already ruled out during the `2026-04-05-nr-browser-spa` task.

Local `.env.local` transport remains valid for dev fallback only.

### Primary delivery model — request-time Node route

The browser loader is served at request time from `/observability/new-relic-browser.js` via `getBrowserAgentScriptSafe()` which calls `getBrowserTimingHeaderSafe()` which calls the NR APM Node agent `getBrowserTimingHeader()`. No snippet env var is required on Vercel.

### SPA vs rum/lite — browser agent type

`getBrowserTimingHeaderSafe()` returns whichever loader type the APM app is configured for in the NR UI. If the APM app browser monitoring type is set to rum/lite, only the initial hard page load is tracked — App Router client-side navigations are invisible. To get full SPA monitoring, change the type to SPA in the NR UI: Browser → App → Application settings → Browser agent type → SPA.

### Prior task — mandatory reading

Full implementation history, constraints, and operational decisions are in `.copilot/tasks/2026-04-05-nr-browser-spa/`.

Any agent working on NR Browser must read that task folder BEFORE making any recommendations or code changes.

## Integration split

There are two separate concerns:

1. Server-side APM for the Node.js runtime
2. Browser monitoring snippet injection for the root layout

They share New Relic as a vendor, but they do not use the same integration path.

## Server-side integration

### Files

- `newrelic.js`
- `src/instrumentation.ts`
- `src/core/observability/new-relic.ts`
- `src/core/runtime/bootstrap.ts`

### Boot sequence

`src/instrumentation.ts` conditionally loads the module during the Node runtime bootstrap.

```typescript
if (process.env.NEXT_RUNTIME === 'nodejs') {
  if (
    process.env.NEW_RELIC_ENABLED === 'true' &&
    process.env.NEW_RELIC_LICENSE_KEY
  ) {
    require('newrelic');
  }

  await import('../sentry.server.config');
}
```

This keeps the agent disabled by default and avoids loading it when no license key is configured.

### Provider isolation

The rest of the app does not import the `newrelic` SDK directly. All custom usage is isolated behind `src/core/observability/new-relic.ts`.

That facade:

- uses lazy `require('newrelic')`
- no-ops safely when the agent is absent
- wraps container creation in `di.container.create`
- adds custom attributes for request-scoped container creation

This preserves modular boundaries and keeps provider-specific code out of features, modules, and UI delivery layers.

## Browser integration

### Files

- `src/app/layout.tsx`
- `src/app/observability/new-relic-browser.js/route.ts`
- `src/core/observability/new-relic.ts`
- `src/core/env.ts`
- `.env.example`
- `src/security/middleware/with-headers.ts`
- `src/proxy.ts`

### Why the layout does not call `getBrowserTimingHeader()`

In Next.js 16, calling the New Relic browser timing API during a prerenderable layout is unsafe. The underlying SDK records timestamps internally, which triggers the prerender dynamic-access constraint.

Because of that, the layout only loads a public script route. The actual browser loader is generated later in a request-time Node route, not during layout render.

### Active browser path

`src/app/layout.tsx` loads the browser snippet through a public JavaScript route whenever New Relic is enabled.

```tsx
<head>
  {env.NEW_RELIC_ENABLED && (
    <Script
      id="nr-browser-agent"
      src="/observability/new-relic-browser.js"
      strategy="beforeInteractive"
    />
  )}
</head>
```

The script body is served by `src/app/observability/new-relic-browser.js/route.ts`.

That route:

- uses `await connection()` for request-time execution under `cacheComponents: true`
- prefers `getBrowserTimingHeader()` at request time through `getBrowserAgentScriptSafe()`
- returns an empty JavaScript response when New Relic is disabled or no browser snippet is configured
- returns `application/javascript` with `Cache-Control: no-store`
- sets `X-Content-Type-Options: nosniff`

This keeps the layout prerender-safe while avoiding oversized deployment env vars for the full browser copy/paste snippet.

### Why the loader route is not under `/api`

This repository runs a global proxy and security pipeline for `/api/*` routes.

An earlier implementation used `/api/observability/new-relic-browser`, but that path was intercepted by auth and rate-limit middleware and returned JSON instead of JavaScript. The browser then refused to execute it.

The active implementation uses `/observability/new-relic-browser.js` so it is treated like a public script resource rather than a protected API endpoint. This works with the proxy matcher in `src/proxy.ts`, which excludes `.js` paths from the generic non-API matcher while still handling real `/api/*` routes separately.

### Snippet resolution logic

`getBrowserAgentScriptSafe()` supports two deployment paths:

Request-time `getBrowserTimingHeader()` generation from the Node APM agent is the only delivery mechanism.

`NEW_RELIC_BROWSER_SNIPPET` and `NEW_RELIC_BROWSER_SNIPPET_BASE64` env vars have been **removed**. The full copy/paste snippet is ~88 KB — exceeding Vercel's 64 KB per-variable limit. Env-var delivery is not viable for deployment environments. All related helper functions (`getBrowserSnippetSafe`, `resolveBrowserSnippetSource`, `readRawSnippetFromEnvFiles`) have also been removed.

## Environment variables

Server-only env vars involved in this integration:

- `NEW_RELIC_ENABLED`
- `NEW_RELIC_LICENSE_KEY`
- `NEW_RELIC_APP_NAME`
- `NEW_RELIC_NERDGRAPH_API_URL`
- `NEW_RELIC_USER_API_KEY`
- `NEW_RELIC_ACCOUNT_ID`

## CSP requirements

Browser monitoring needs the New Relic beacon domains in `connect-src`. This repository already allows the required domains through the security header path in `src/security/middleware/with-headers.ts`.

## What we intentionally do not do

- We do not call the browser SDK API from `layout.tsx`.
- We do not commit raw browser snippet files into the repository.
- We do not instrument vendor-owned hosts just because New Relic suggests them.
- We do not spread raw `newrelic` imports across features or business logic.

Examples of intentionally ignored vendor-host suggestions include SaaS sinks such as Sentry ingest, Clerk traffic, Upstash, GrowthBook, or Logflare endpoints. If app-owned contract instrumentation is needed later, it should be scoped as its own task.

## Troubleshooting

## NerdGraph debug scripts

For local debugging and operational inspection, this repository now includes
a curated read-only NerdGraph / NRQL catalog:

- `pnpm nr -- list`
- `pnpm nr -- run baseline`
- `pnpm nr -- run baseline --view=compact`
- `pnpm nr -- run golden-signals`
- `pnpm nr -- run throughput.rate`
- `pnpm nr:query -- "SELECT count(*) FROM Transaction SINCE 1 hour ago"`

Optional flags:

- `--format=json` for machine-readable output
- `--account=1234567` to override `NEW_RELIC_ACCOUNT_ID`
- `--view=compact` for an operator-friendly bundle summary

Design notes:

- `pnpm nr` is the professional day-to-day entrypoint
- query definitions live in `scripts/new-relic/catalog.ts`
- bundles keep `package.json` small while preserving a rich query set
- compact view turns baseline-style bundles into a one-row summary plus short highlights
- `pnpm nr:query` remains the escape hatch for one-off or advanced NRQL

These commands are intentionally separate from the Next.js runtime integration:

- they run only from `scripts/new-relic/*`
- they use a user API key, not the APM license key
- they are meant for debugging, CI diagnostics, and human investigation
- they do not expose arbitrary NRQL execution to browser code or public routes

### No browser data arrives in New Relic

Verify all of the following:

- `NEW_RELIC_ENABLED=true`
- `NEW_RELIC_LICENSE_KEY` is present in the deployment environment
- server rendered `<script id="nr-browser-agent" src="/observability/new-relic-browser.js">`
- `/observability/new-relic-browser.js` returns `200` with JavaScript content (non-empty)
- Vercel logs show no `[NR Browser] Empty script ...` warning, or if they do, check `loaded=`, `connected=`, `tx=`, and `appId=` values
- NR APM entity has browser monitoring **enabled** in NR UI (APM → Applications → your app → Settings → Application)
- Browser monitoring type is set to **Pro + SPA** in NR UI
- `logging.filepath: 'stdout'` is set in `newrelic.js` (prevents EROFS crash on Vercel)
- The route runs in the Node runtime, not Edge
- CSP `connect-src` allows the NR beacon host
- Enough ingest time has passed (NR can take 5-15 minutes to display new browser data)

### Empty browser script on Vercel (EROFS)

If `newrelic.js` does not have `logging.filepath: 'stdout'`, the NR agent crashes on startup trying to write a log file to the read-only Vercel filesystem. This causes both backend APM and browser monitoring to fail. Verify `newrelic.js` has `logging: { level: 'info', filepath: 'stdout' }`.

### Deploy validation rule

If `NEW_RELIC_ENABLED=true`, the deployment must also provide
`NEW_RELIC_LICENSE_KEY`.

This repository now treats that as a deploy-time cross-field requirement:

- `pnpm env:validate` fails when New Relic is enabled without a license key
- the root layout does not inject the browser loader unless both values are present
- `/env-summary` and `/api/internal/env-check` report the misconfiguration

### Empty browser script on cold start (`agentConnected: false`)

The NR APM agent needs ~1-3 seconds after cold start to connect to the NR collector. Until connected, `isConnected()` = false and the browser route returns an empty script. This is expected for the first request after a cold start. Subsequent warm requests will return the full snippet.

### Empty browser script with `tx=false` or `appId=false`

If the warning shows `tx=false`, the browser timing API is being called without an active instrumented web transaction.

If it shows `appId=false`, the agent still has not completed the collector handshake and does not have `application_id` yet.

## Guardrails

- Keep server APM initialization in `src/instrumentation.ts`.
- Keep custom SDK usage isolated in `src/core/observability/new-relic.ts`.
- Keep browser injection request-time, Node-only, and layout-safe.
- Keep browser loader delivery on a public non-API route unless proxy behavior is intentionally redesigned.
- Do NOT add `NEW_RELIC_BROWSER_SNIPPET` or `NEW_RELIC_BROWSER_SNIPPET_BASE64` env vars back — they are removed. The snippet is ~88 KB, exceeding Vercel's 64 KB per-variable limit.
- Treat vendor-host instrumentation suggestions as out of scope unless a separate task justifies them.
