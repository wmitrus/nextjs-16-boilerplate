# Validation Report

**Session**: `2a857370-6b74-46a7-aa84-15afb8dddb4c`
**Date**: 2026-04-16
**Scope**: NR Browser CDN fix, rate-limit loop prevention, documentation

---

## Automated Checks

| Check             | Result                               | Notes                                                   |
| ----------------- | ------------------------------------ | ------------------------------------------------------- |
| `pnpm typecheck`  | ✅ 0 errors                          |                                                         |
| `pnpm lint --fix` | ✅ 0 errors                          | 4 pre-existing false-positive warnings (SEC-documented) |
| `pnpm test`       | ✅ 146 files, 1029 tests, all passed | +8 new tests added this session                         |
| `pnpm arch:lint`  | ✅ PASS                              | skott + madge, no circular deps                         |

---

## Code Changes Validated

### Rate-Limit Loop Prevention

| File                                                  | Change                                                                                                                            | Tests                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `src/shared/lib/rate-limit/rate-limit-helper.ts`      | Added `meta?: { path?: string }` to `checkRateLimit()`; WARN context now includes `path`; SEC-10 fix (`errorMessage`/`errorName`) | +3 tests in `rate-limit-helper.test.ts` |
| `src/security/middleware/with-rate-limit.ts`          | Removed `SELF_RATE_LIMITED_PATHS` bypass; passes `{ path: pathname }` to every `checkRateLimit()` call                            | +2 tests in `with-rate-limit.test.ts`   |
| `src/shared/lib/rate-limit/rate-limit-helper.mock.ts` | Updated to forward `meta` parameter                                                                                               | —                                       |

### NR Browser — `agentID` vs `applicationID` Split

| File                                               | Change                                                    |
| -------------------------------------------------- | --------------------------------------------------------- |
| `src/core/observability/new-relic-browser.ts`      | `applicationId = APPLICATION_ID ?? APP_ID` fallback       |
| `src/core/env.ts`                                  | `NEW_RELIC_BROWSER_APPLICATION_ID` optional env var added |
| `src/app/layout.tsx`                               | `agentID` and `applicationID` now use separate fields     |
| `src/core/observability/new-relic-browser.test.ts` | 17 tests — all pass                                       |

---

## Documentation Updated

| File                                                           | What changed                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/features/26 - New Relic Server & Browser Integration.md` | Complete rewrite: "Why Official NR Docs Don't Apply", `agentID` vs `applicationID` (both standalone and APM-linked cases), per-environment entity setup, `allowTransactionlessInjection` ban, updated prior-task table, updated troubleshooting for `beacon:XXXXXXX` |
| `docs/features/13 - Rate Limiting.md`                          | Complete rewrite: Loop Prevention Architecture section, `meta.path` parameter documentation, `SELF_RATE_LIMITED_PATHS` removal rationale, guardrails                                                                                                                 |
| `AGENTS.md`                                                    | New sections: NR `agentID`/`applicationID`, per-environment entity setup, rate-limit loop prevention; SEC-17 added to compact rule table                                                                                                                             |
| `docs/ai/general/SECURITY_CODING_PATTERNS.md`                  | SEC-17 added to summary table and full entry                                                                                                                                                                                                                         |

---

## Outstanding Items (NOT Code — Manual Steps Required)

These are **not code gaps** — they require manual action in external systems:

### 🔴 Clerk Production Migration (blocking for real users)

The `2026-04-13-clerk-prod-migration` code changes are complete but Vercel/Clerk manual steps were never done. The Sentry error `Clerk: Failed to load Clerk, failed to load script: https://pleased-hound-90.clerk.accounts.dev/...` on the preview environment confirms external users are hitting this.

Required:

1. Clerk Dashboard → create Production application instance → get `pk_live_` / `sk_live_` keys
2. Clerk Dashboard → add Vercel preview + production URLs to allowed redirect URLs
3. Vercel Dashboard → update `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to `pk_live_` for Production + Preview environments

### 🟡 NR Browser Per-Environment Entities (data mixing)

- Set `NEW_RELIC_BROWSER_APPLICATION_ID=421257384` scoped to **Preview** in Vercel
- Get Production entity's `applicationID` from NR UI → Production browser entity → App settings → Copy/Paste snippet → `info.applicationID` → set scoped to **Production** in Vercel
- Rename `beacon:421257384` in NR UI (entity header → inline rename → `nextjs-16-boilerplate-preview`)

---

## Status

**All code tasks: COMPLETE ✅**
**Manual external steps: PENDING ⏳** (Clerk prod migration, NR entity config)
