# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-08-vercel-newrelic-incident`
- Leantime Task ID: `42`
- Objective: restore New Relic backend and browser telemetry on Vercel preview and production
- Status: in_progress
- Last Updated: 2026-04-08

## Confirmed Evidence

- Local Node.js development connects to New Relic successfully and reports to account `6443682`.
- Vercel preview and production both serve `200` from `/observability/new-relic-browser.js` with an empty body.
- New Relic still contains historical data for `nextjs-16-boilerplate`, `nextjs-16-boilerplate-preview`, and `nextjs-16-boilerplate-local`, so the entities are valid and not deleted.
- New Relic shows no fresh `Transaction`, `PageView`, or `BrowserInteraction` events in the recent incident window after the affected Vercel deploys.
- Preview deployment build logs show `temp-nextjs-scaffold@1.22.0`; production was deployed from prebuilt `.vercel/output` during `v1.23.0`. The symptom spans both deployment paths.
- The repository already logs `[NR Browser]` warnings when the browser route resolves to an empty script.

## Root Cause

The live Vercel failure is not explained by a missing browser snippet fallback. Preview `v1.22.0` still had the older fallback code path, yet the hosted route remained empty.

The stronger root cause is bootstrap timing:

- New Relic's official Next.js install guidance requires preloading the agent with `NODE_OPTIONS='-r newrelic'`.
- This repository was relying on a later `require('newrelic')` inside `src/instrumentation.ts`.
- In hosted Next.js/Vercel runtimes, that late load can miss reliable web-transaction instrumentation.
- When the runtime lacks an active instrumented transaction or collector/application metadata, `getBrowserTimingHeader()` degrades to an empty comment and the route returns an empty JavaScript asset.
- The same bootstrap failure also explains why backend `Transaction` telemetry disappears from Vercel while local development still works.

## Remediation Applied

- Added deploy/runtime validation that `NEW_RELIC_ENABLED=true` in production requires both `NEW_RELIC_LICENSE_KEY` and `NODE_OPTIONS` preloading `newrelic`.
- Added hosted-runtime diagnostics for missing preload in env diagnostics.
- Extended New Relic browser diagnostics to surface:
  - `agentLoaded`
  - `agentConnected`
  - `hasActiveTransaction`
  - `hasApplicationId`
- Simplified the route warning into a compact searchable log line:
  - `[NR Browser] Empty script loaded=... connected=... tx=... appId=...`
- Updated docs and `.env.example` to document the required preload.

## Remaining Operational Step

Before preview/production redeploy, Vercel project envs must include:

- `NODE_OPTIONS=-r newrelic`

Without that hosted preload, the repository will now fail deploy validation instead of silently shipping broken telemetry.
