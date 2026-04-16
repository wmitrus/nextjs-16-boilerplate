# Validation Strategy

**Step**: 6 — Validation Strategy
**Agent**: Validation Strategy Agent
**Date**: 2026-04-13
**Status**: complete

---

## Change Risk Classification

**Risk level**: Low-Medium

- No auth, authorization, or tenancy changes
- No business logic changes
- Affects only observability injection (browser monitoring script)
- Server Component (layout) and route handler changes
- Failure mode: NR script not loaded / NR not tracking — not a functional regression
- No data loss risk, no security regression

---

## Minimum Required Validation

### V1 — TypeScript typecheck

```shell
pnpm typecheck
```

Verify no type errors in:

- `src/core/observability/new-relic-browser.ts` (new exported type/function)
- `src/app/layout.tsx` (inline script usage)
- `src/app/observability/new-relic-browser.js/route.ts` (CDN branch removal)

### V2 — Lint

```shell
pnpm lint --fix
```

Verify no lint errors in changed files. Note: `pnpm lint --fix` per AGENTS.md policy (never plain `pnpm lint`).

### V3 — Unit Tests

```shell
pnpm test
```

Affected test files:

- `src/core/observability/new-relic-browser.test.ts` — tests for `getNrBrowserCdnConfig()`, `isNrBrowserCdnEnabled()`
- `src/app/observability/new-relic-browser.js/route.test.ts` — CDN branch test cases must be removed

Coverage threshold: 80% maintained.

### V4 — Manual Browser Verification (Required)

On local dev with `NEW_RELIC_BROWSER_ENABLED=true` + credentials set:

1. `pnpm dev`
2. Open browser DevTools → Elements → `<head>` — verify inline NREUM config script is present
3. DevTools → Network — verify `nr-spa.min.js` loaded from `https://js-agent.newrelic.com`
4. DevTools → Console — verify no NR initialization errors
5. NR Browser application → wait 1-2 min → verify `PageView` event arrives

On Vercel preview deploy (after merging):

1. Open browser DevTools → Elements → verify inline NREUM config script in `<head>`
2. Network → verify `nr-spa.min.js` loaded
3. Console → no CSP errors, no NR errors
4. NR Browser application → verify PageView events

---

## Optional Additional Validation

### V5 — Integration test for route handler

Verify that the route handler with CDN branch removed still correctly:

- Returns empty when `NEW_RELIC_ENABLED=false`
- Returns empty when APM agent not connected (Vercel case)
- Returns APM snippet when agent IS connected (local dev)

```shell
pnpm test:integration
```

### V6 — Architecture lint

```shell
pnpm arch:lint
```

Verify no new dependency boundary violations.

---

## Validation Not Required

- E2E Playwright tests: NR script injection is infrastructure-level, not a user-facing flow. No auth or routing changes. E2E not warranted.
- Security scan: No auth, secrets, or trust boundary changes.
- Performance benchmarks: Script strategy change is expected to improve (not regress) performance metrics.

---

## Validation Commands

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```
