# Incident Plan — NR Browser Monitoring: Production Not Reporting

**Task ID**: 4d2961d4-1ae4-4bd6-ad9b-27edba0de3ca
**Date**: 2026-04-08
**Status**: ✅ Complete — awaiting deploy verification

## Checklist

- [x] Step 1 — Debug Investigation: Root cause analysis
- [x] Step 2 — Implementation: All fixes applied
- [ ] Step 3 — Validation: Confirm production browser data appears after deploy
- [x] Step 4 — Documentation: Feature doc, AGENTS.md, and plan updated

## Changes Deployed

### Fix 1 — EROFS crash (blocked all NR data on Vercel)

`newrelic.js`: Added `logging.filepath: 'stdout'` — NR agent logs to stdout instead of crashing on read-only `/var/task/` filesystem.

### Fix 2 — NR SPA hook (soft-nav tracking was missing)

`src/instrumentation-client.ts`: `onRouterTransitionStart` now calls both Sentry and `window.newrelic?.interaction()?.setName(url)?.save()` so App Router client-side navigations are tracked in NR Browser.

### Fix 3 — Window type declarations (required for Fix 2)

`src/types/globals.d.ts`: Added `NewRelicBrowserInteraction`, `NewRelicBrowserAgent`, `Window.newrelic?` types.

### Fix 4 — Snippet env vars removed (dead code cleanup)

Removed `NEW_RELIC_BROWSER_SNIPPET` and `NEW_RELIC_BROWSER_SNIPPET_BASE64` and all supporting code:

- `src/core/env.ts`: schema entries removed
- `src/core/observability/new-relic.ts`: `readRawSnippetFromEnvFiles()`, `resolveBrowserSnippetSource()`, `getBrowserSnippetSafe()`, `resolveBrowserAgentScriptSource()` removed; `getBrowserAgentScriptSafe()` simplified to delegate to `getBrowserTimingHeaderSafe()`
- `src/testing/infrastructure/env.ts`: stale mock defaults removed
- `.env.example`: snippet var entries removed
- `.env.local`: commented snippet vars removed
- `AGENTS.md`: code examples and references updated
- `docs/features/26 - New Relic Server & Browser Integration.md`: section rewritten

### Fix 5 — Diagnostic logging

`src/app/observability/new-relic-browser.js/route.ts`: Logs `[NR Browser] Returning empty browser script.` with `{ agentLoaded, agentConnected }` when the snippet is empty (only when `NEW_RELIC_ENABLED=true`).

## Remaining User Action Required

**In NR UI**: Verify production entity `nextjs-16-boilerplate` has browser monitoring **enabled** and set to **Pro + SPA** (APM → Applications → nextjs-16-boilerplate → Settings → Application).

After deploying, check Vercel production logs for `[NR Browser]` warn — `agentConnected: false` indicates cold start timing; `agentConnected: true` means browser monitoring not enabled in NR UI.
