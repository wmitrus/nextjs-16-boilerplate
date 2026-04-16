# Implementation Report

**Step**: 7 — Implementation
**Agent**: Implementation Agent
**Date**: 2026-04-13
**Status**: complete

---

## Scope

Three-part fix addressing root causes identified in the flow trace and remediation plan:

1. Wrong script loading strategy (`afterInteractive` → `beforeInteractive`)
2. Double-hop architecture (route handler JS → dynamic script → NR CDN)
3. Missing `NREUM.init` object

---

## Files Changed

### 1. `src/core/observability/new-relic-browser.ts`

**Before**: Exported `getNrBrowserCdnSnippet()` returning a full JS IIFE that dynamically created a `<script>` element; exported `isNrBrowserCdnEnabled()`.

**After**: Exports `getNrBrowserCdnConfig()` returning a typed `NrBrowserCdnConfig | null` object (no script string, no dynamic script injection); exports `isNrBrowserCdnEnabled()` unchanged.

**New interface**:

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
```

The `NREUM.init` object with `distributed_tracing`, `privacy`, and `ajax.deny_list` is now part of the config and will be inlined in the HTML.

### 2. `src/app/layout.tsx`

**Removed**: `isNewRelicEnabled` union flag, single `<Script>` tag with `strategy="afterInteractive"`.

**Added**:

- Import of `getNrBrowserCdnConfig` from `@/core/observability/new-relic-browser`
- `cdnConfig = getNrBrowserCdnConfig()` call (returns `null` when disabled/unconfigured)
- When `cdnConfig !== null`:
  - Inline `<script dangerouslySetInnerHTML>` that sets `window.NREUM`, `NREUM.init`, `NREUM.loader_config`, `NREUM.info`
  - `<Script id="nr-browser-cdn" src="https://js-agent.newrelic.com/nr-spa.min.js" strategy="beforeInteractive" />`
- When CDN mode is off and APM mode is on (`isNewRelicApmBrowserEnabled && !cdnConfig`):
  - `<Script id="nr-browser-agent" src="/observability/new-relic-browser.js" strategy="afterInteractive" />` (local dev only)

### 3. `src/app/observability/new-relic-browser.js/route.ts`

**Removed**: CDN branch (`if (env.NEW_RELIC_BROWSER_ENABLED)` block that called `getNrBrowserCdnSnippet()`); import of `getNrBrowserCdnSnippet`.

**Kept**: APM-linked path only (`getBrowserAgentScriptSafe()`, diagnostic logging, `console.warn`/`console.info` for Vercel vs local).

**Gate simplified**: Returns empty when `!env.NEW_RELIC_ENABLED || !env.NEW_RELIC_LICENSE_KEY` (previously checked both NR and NR_BROWSER).

### 4. `src/core/observability/new-relic-browser.test.ts`

**Updated**: All tests rewritten against `getNrBrowserCdnConfig()` (replacing `getNrBrowserCdnSnippet()` tests). Added test for `NREUM.init` presence and `ajax.deny_list`, and for `accountId` defaulting to empty string when `ACCOUNT_ID` is unset.

### 5. `src/app/observability/new-relic-browser.js/route.test.ts`

**Removed**: All CDN-related test cases (`getNrBrowserCdnSnippet` mock, CDN snippet test, CDN fall-through test, both-disabled test referencing CDN).

**Kept**: APM-path tests only (disabled, missing license key, empty snippet warn/info logging, successful snippet return).

---

## Logic Changes

| Before                                                                      | After                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Layout: `strategy="afterInteractive"` via route handler                     | CDN mode: `strategy="beforeInteractive"` direct to NR CDN            |
| CDN delivery: route handler JS → dynamic `document.createElement('script')` | CDN delivery: inline NREUM config + direct `<Script src>`            |
| No `NREUM.init` in config                                                   | `NREUM.init` with `distributed_tracing`, `privacy`, `ajax.deny_list` |
| Route handler served CDN and APM                                            | Route handler serves APM only                                        |

---

## Tests

- **146 test files, 1007 tests** — all passing ✓
- TypeScript typecheck — clean ✓
- ESLint with `--fix` — 0 errors, 4 pre-existing warnings in unrelated files ✓
