# Validation Report — NR Browser SPA Agent Integration

**Task ID**: `2026-04-05-nr-browser-spa`
**Date**: 2026-04-05
**Status**: ✅ All gates passed, including runtime follow-up, disabled-env build validation, and CLI hardening checks

---

## Test Suite

| Suite         | Files | Tests | Result        |
| ------------- | ----- | ----- | ------------- |
| Unit (vitest) | 132   | 892   | ✅ All passed |

## Static Analysis

| Check              | Result                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`   | ✅ 0 errors                                                                                               |
| `pnpm lint --fix`  | ✅ 0 errors (4 pre-existing security warnings, confirmed false positives per SECURITY_CODING_PATTERNS.md) |
| `pnpm build`       | ✅ Passed after moving browser script delivery to `/observability/new-relic-browser.js`                   |
| Disabled-env build | ✅ Passed after clearing `.next` and building with `NEW_RELIC_ENABLED=false`                              |
| Script tests       | ✅ `scripts/new-relic/lib.test.ts` + `scripts/new-relic/cli.test.ts` passed (19 tests)                    |

## Manual Smoke Test (Confirmed by User)

- `NEW_RELIC_BROWSER_SNIPPET` set in `.env.local`
- NREUM snippet injected in page `<head>` with `applicationID: "538837440"` ✅
- CSP not blocking inline snippet ✅

## Runtime Follow-Up Validation

### Issue 3 — Protected API route broke externalized browser loader

**Symptom**: first externalized implementation used `/api/observability/new-relic-browser`; local production requests returned auth JSON (`401`) because the global proxy treats `/api/*` as protected unless explicitly public. Browser execution then failed strict MIME checking.

**Fix**: moved the route to `/observability/new-relic-browser.js`, outside the protected API namespace, and updated `src/app/layout.tsx` to load that URL with `next/script`.

**Validation**:

- `GET /observability/new-relic-browser.js` returned `200`
- `Content-Type` returned `application/javascript; charset=utf-8`
- local Chromium page load on `/` completed with `ERROR_COUNT 0`
- page title and primary heading rendered correctly

**Status**: ✅ Fixed locally

### Issue 4 — Disabled preview env failed prerender export

**Symptom**: preview deploy failed while prerendering `/observability/new-relic-browser.js` when `NEW_RELIC_ENABLED` was unset or false.

**Root cause**: the disabled/no-snippet path for the route used a no-content response strategy that failed in the Next.js prerender/export path.

**Fix**: changed the route to return an empty JavaScript asset with normal script headers when New Relic is disabled or no snippet is configured.

**Validation**:

- clean build passed after `rm -rf .next`
- clean build passed with `NEW_RELIC_ENABLED=false`
- clean build passed with `NEW_RELIC_BROWSER_SNIPPET` and `NEW_RELIC_BROWSER_SNIPPET_BASE64` unset

**Status**: ✅ Fixed locally

## New Issues Found During Smoke Test (Fixed)

### Issue 1 — CSP blocking NR CDN script

**Symptom**: `Loading 'https://js-agent.newrelic.com/nr-spa-1.312.1.min.js' violates script-src-elem`
**Fix**: Added `https://js-agent.newrelic.com` to `scriptSrc` in `src/security/middleware/with-headers.ts`
**Status**: ✅ Fixed, tests pass

### Issue 2 — Next.js 16 prerender `Date.now()` error

**Symptom**: `Route "/security-showcase" used new Date() before accessing uncached data... getBrowserTimingHeaderSafe → RootLayout`
**Root cause**: `getBrowserSnippetSafe()` originally had a fallback to `getBrowserTimingHeaderSafe()`. That fallback called `nr.getBrowserTimingHeader()` which records timestamps internally, triggering the prerender check.
**Fix**: Removed the fallback entirely. `getBrowserSnippetSafe()` now only reads `process.env.NEW_RELIC_BROWSER_SNIPPET ?? ''`.
**Pattern documented**: New section added to `AGENTS.md` — "RSC Prerender — Third-Party API `Date.now()` Constraint"
**Status**: ✅ Fixed, tests pass

## Residual Notes

- `getBrowserTimingHeaderSafe()` is retained (not removed) with a JSDoc warning documenting the prerender constraint. It may be useful for non-prerendered route handlers in the future.
- `NEW_RELIC_BROWSER_SNIPPET` must be set in deployment secrets (Vercel env vars) for browser monitoring to work in production.
- After deployment, preview should be rechecked once to confirm the external script path clears both the reported hydration failure and the disabled-env export path.
- Rollback: unset `NEW_RELIC_BROWSER_SNIPPET` — system silently skips injection, no errors.
