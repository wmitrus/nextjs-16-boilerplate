# New Relic Server & Browser Integration

## Purpose

This document explains how New Relic is integrated in this repository for both server-side APM and browser monitoring, and why the browser path uses a request-time Node loader route instead of calling the New Relic browser API at layout render time.

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

`src/instrumentation.ts` conditionally loads the Node.js agent during the Node runtime bootstrap.

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

- is pinned to the Node runtime and forced dynamic execution
- prefers `getBrowserTimingHeader()` at request time through `getBrowserAgentScriptSafe()`
- falls back to the env-backed snippet only for local/dev compatibility or when the agent is unavailable
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

1. Preferred for deployments: request-time `getBrowserTimingHeader()` generation from the Node agent
2. Fallback for local/dev compatibility: env-backed snippet resolution

The env-backed fallback still supports three realities:

1. Preferred local transport: `NEW_RELIC_BROWSER_SNIPPET_BASE64`
2. Fallback: `NEW_RELIC_BROWSER_SNIPPET`
3. Recovery path: re-read `.env.local` or `.env` when dotenv truncates the raw snippet at `#`

The helper also strips optional outer `<script>` tags so either raw JavaScript or a copied HTML wrapper can be tolerated.

## Environment variables

Server-only env vars involved in this integration:

- `NEW_RELIC_ENABLED`
- `NEW_RELIC_LICENSE_KEY`
- `NEW_RELIC_APP_NAME`
- `NEW_RELIC_NERDGRAPH_API_URL`
- `NEW_RELIC_USER_API_KEY`
- `NEW_RELIC_ACCOUNT_ID`
- `NEW_RELIC_BROWSER_SNIPPET`
- `NEW_RELIC_BROWSER_SNIPPET_BASE64`

### Preferred deployment path

For Vercel and other hosted deployments, prefer the request-time Node loader route and do not rely on storing the full browser copy/paste snippet in env vars.

Reason: the full snippet can exceed practical deployment env-var limits and is awkward to manage operationally.

### Preferred local transport

Use `NEW_RELIC_BROWSER_SNIPPET_BASE64` for local dotenv files.

Reason: raw New Relic browser snippets can contain `#`, and dotenv treats that as a comment delimiter. That can truncate the value and produce broken JavaScript at runtime.

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

### Browser snippet loads but breaks in the console

Most likely cause: truncated raw env content.

Check whether the snippet was stored in `NEW_RELIC_BROWSER_SNIPPET` inside a dotenv file and contains `#`. If so, move it to `NEW_RELIC_BROWSER_SNIPPET_BASE64`.

### `_BASE64` variable contains raw JavaScript

The resolver tolerates this for compatibility, but it is still the wrong storage format. Use actual base64 for stable transport.

### No browser data arrives in New Relic

Verify all of the following:

- `NEW_RELIC_ENABLED=true`
- server rendered the `<script id="nr-browser-agent" src="/observability/new-relic-browser.js">`
- `/observability/new-relic-browser.js` returns `200` with JavaScript, not `401` or JSON
- the route runs in the Node runtime, not Edge
- when New Relic is intentionally disabled, `/observability/new-relic-browser.js` still resolves as a harmless empty JavaScript asset
- CSP `connect-src` allows the NR beacon host
- if you use the env fallback locally, the copied snippet is for the correct app
- enough ingest time has passed for data to appear

## Guardrails

- Keep server APM initialization in `src/instrumentation.ts`.
- Keep custom SDK usage isolated in `src/core/observability/new-relic.ts`.
- Keep browser injection request-time, Node-only, and layout-safe.
- Keep browser loader delivery on a public non-API route unless proxy behavior is intentionally redesigned.
- Prefer base64 snippet transport only for local dotenv fallback.
- Treat vendor-host instrumentation suggestions as out of scope unless a separate task justifies them.
