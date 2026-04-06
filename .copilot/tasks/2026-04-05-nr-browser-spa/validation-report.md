# Validation Report — NR Browser SPA Agent Integration

**Task ID**: `2026-04-05-nr-browser-spa`
**Date**: 2026-04-06
**Status**: ✅ Focused validation passed for the Vercel env-size follow-up and request-time Node loader refactor

---

## Focused Validation Executed

| Check                | Result                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm lint --fix`    | ✅ 0 errors on touched observability/layout files                                                 |
| Helper tests         | ✅ `src/core/observability/new-relic.test.ts` passed                                              |
| Route tests          | ✅ `src/app/observability/new-relic-browser.js/route.test.ts` passed                              |
| Combined focused run | ✅ `14` tests passed with `--coverage.enabled=false` to avoid unrelated global threshold failures |

## Commands Run

- `pnpm lint --fix src/core/observability/new-relic.ts src/core/observability/new-relic.test.ts src/app/observability/new-relic-browser.js/route.ts src/app/observability/new-relic-browser.js/route.test.ts src/app/layout.tsx`
- `pnpm exec vitest run src/core/observability/new-relic.test.ts src/app/observability/new-relic-browser.js/route.test.ts --config vitest.unit.config.ts --coverage.enabled=false`

## Assertions Proven In This Follow-Up

- the public loader route is pinned to `runtime = 'nodejs'`
- the public loader route is pinned to `dynamic = 'force-dynamic'`
- disabled/unresolved loader states return an empty JavaScript asset cleanly
- runtime-generated browser loader content is preferred over env-backed fallback content
- the env-backed fallback still works when runtime-generated content is absent

## Validation Not Re-Run In This Follow-Up

- full `pnpm build`
- remote preview deployment verification
- New Relic dashboard ingest verification after this follow-up refactor

## Residual Notes

- `getBrowserTimingHeaderSafe()` is retained with a JSDoc warning documenting the prerender constraint.
- The primary hosted deployment path is now request-time Node loader generation, not a giant env-backed snippet.
- `NEW_RELIC_BROWSER_SNIPPET` and `NEW_RELIC_BROWSER_SNIPPET_BASE64` remain optional fallback inputs, mainly for local/dev compatibility.
- After deployment, preview should be rechecked once to confirm `/observability/new-relic-browser.js` resolves from the Node agent in Vercel runtime.
