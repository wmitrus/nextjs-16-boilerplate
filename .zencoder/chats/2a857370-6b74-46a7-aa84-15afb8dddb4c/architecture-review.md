# Architecture Impact Review

**Step**: Architecture Impact Review
**Agent**: Architecture Guard Agent
**Date**: 2026-04-16
**Status**: complete

---

## Scope

Verify the proposed fixes for NR Browser CDN monitoring do not violate architecture rules.

## Proposed Changes (from remediation plan)

1. Fix beacon default in `src/core/observability/new-relic-browser.ts` — change EU default to US
2. Fix duplicate `NEW_RELIC_BROWSER_BEACON` in `.env.example`
3. Add `NEW_RELIC_BROWSER_BEACON` to `.env.local`
4. Document Vercel env var requirements in `.env.example` and/or docs

---

## Module Boundaries

| Layer                     | File                   | Assessment                                                                        |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `src/core/observability/` | `new-relic-browser.ts` | Core observability facade — correct layer for beacon config                       |
| `src/core/env.ts`         | Env schema             | No schema changes needed — `NEW_RELIC_BROWSER_BEACON` already defined as optional |
| `.env.example`            | Config template        | Not code — safe to edit                                                           |
| `.env.local`              | Local secrets          | Not committed — safe                                                              |

All changes are within the `core/observability` domain or environment configuration. No module boundary violations.

## DI/Composition Impact

No DI changes. `getNrBrowserCdnConfig()` is a pure function reading env vars — no container involvement. No composition root changes needed.

## Security/Auth Regressions

None. The beacon URL change from EU to US does not affect:

- Authentication (Clerk)
- Authorization (ABAC)
- Tenant context
- Sensitive data exposure

Browser license keys are intentionally public — NR Browser monitoring by design embeds keys in HTML.

## Runtime Placement

No runtime placement changes. The fix stays in `src/core/observability/new-relic-browser.ts` (server-only module). No client-bundle exposure changes.

## Architecture Verdict

**APPROVED** — all changes are low blast-radius, within correct module, no security regressions.
