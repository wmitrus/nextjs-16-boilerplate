# Validation Strategy

**Step**: Validation Strategy
**Agent**: Validation Strategy Agent
**Date**: 2026-04-16
**Status**: complete

---

## Change Risk Classification

| Change                                                          | Risk   | Scope                         |
| --------------------------------------------------------------- | ------ | ----------------------------- |
| Remove duplicate `NEW_RELIC_BROWSER_BEACON` from `.env.example` | Low    | Config file only, no code     |
| Add `NEW_RELIC_BROWSER_BEACON` to `.env.local`                  | Low    | Local dev config only         |
| Update `new-relic-browser.ts` code comment                      | Low    | Comment only, no logic change |
| Vercel env var updates + redeploy                               | Medium | Runtime behavior on Vercel    |

## Minimum Required Validation

1. **Typecheck**: `pnpm typecheck` — verify no TypeScript errors (no logic changes, but run as standard gate)
2. **Lint**: `pnpm lint --fix` — run with --fix as per AGENTS.md (no code changes expected to produce errors)
3. **Unit tests**: `pnpm test` — verify existing NR browser unit tests still pass

## Optional Additional Validation

- Manual browser verification after Vercel redeploy: open browser DevTools → Network tab → check for `nr-spa-1.312.1.min.js` loading (200) and POST requests to `bam.eu01.nr-data.net`
- NR Browser app verification: open NR UI → Browser app for each environment → confirm PageView events appear within 30 minutes

## Validation NOT Required

- E2E tests (Playwright): no browser behavior changes in this fix
- Integration tests: no server-side integration logic changed
- Architecture lint (`pnpm arch:lint`): no module boundary changes

## Validation Commands

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```
