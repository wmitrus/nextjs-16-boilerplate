# Validation Report — NR Browser SPA Agent Integration

**Task ID**: `2026-04-05-nr-browser-spa`
**Date**: 2026-04-05
**Status**: ✅ All gates passed

---

## Test Suite

| Suite         | Files | Tests | Result        |
| ------------- | ----- | ----- | ------------- |
| Unit (vitest) | 132   | 892   | ✅ All passed |

## Static Analysis

| Check             | Result                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`  | ✅ 0 errors                                                                                               |
| `pnpm lint --fix` | ✅ 0 errors (4 pre-existing security warnings, confirmed false positives per SECURITY_CODING_PATTERNS.md) |

## Manual Smoke Test (Confirmed by User)

- `NEW_RELIC_BROWSER_SNIPPET` set in `.env.local`
- NREUM snippet injected in page `<head>` with `applicationID: "538837440"` ✅
- CSP not blocking inline snippet ✅

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
- Rollback: unset `NEW_RELIC_BROWSER_SNIPPET` — system silently skips injection, no errors.
