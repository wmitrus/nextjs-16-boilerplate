# 04 - Implementation Agent — Summary

**Task**: Clerk Production Instance Migration
**Task ID**: `2026-04-13-clerk-prod-migration`

## Changes Applied

### `src/security/outbound/secure-fetch.ts`

**Change**: Made `clerk.accounts.dev` conditional in the `coreAllowed` outbound
allowlist, mirroring the existing pattern in `with-headers.ts`.

**Before**: `clerk.accounts.dev` was unconditionally in `coreAllowed` for all
environments, including production with `pk_live_` keys.

**After**: `clerk.accounts.dev` is only included when:

- `env.NODE_ENV === 'development'`, OR
- `env.VERCEL_ENV === 'preview'`, OR
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starts with `pk_test_` or `pk_development_`

This matches the CSP conditional logic in `with-headers.ts` exactly.

### `src/security/outbound/secure-fetch.test.ts`

**Change**: Added two new test cases for the conditional dev-domain behavior:

1. `should allow requests to clerk.accounts.dev when using a dev Clerk key`
   — sets `mockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_devkey123'`
   → expects `clerk.accounts.dev` subdomain request to succeed
2. `should block requests to clerk.accounts.dev when using a production Clerk key`
   — sets `mockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_prodkey123'`
   → expects `clerk.accounts.dev` subdomain request to throw `SSRF Protection`

## Validation Results

| Check                                    | Result                                |
| ---------------------------------------- | ------------------------------------- |
| `pnpm typecheck`                         | ✅ 0 errors                           |
| `pnpm lint --fix`                        | ✅ 0 errors (4 pre-existing warnings) |
| `secure-fetch.test.ts` (7 tests)         | ✅ All pass                           |
| Full unit suite (146 files, 1011+ tests) | ✅ All pass                           |

## Files Changed

| File                                         | Type                   |
| -------------------------------------------- | ---------------------- |
| `src/security/outbound/secure-fetch.ts`      | Modified               |
| `src/security/outbound/secure-fetch.test.ts` | Modified (tests added) |

## Files NOT Changed

| File                                      | Reason                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `src/security/middleware/with-headers.ts` | Already correct — no change needed                                        |
| `src/core/env.ts`                         | No new env vars added                                                     |
| `.env.example`                            | Clerk key format documented via placeholder (`pk_test_...`)               |
| `src/testing/infrastructure/env.ts`       | Mock `pk_test` (no underscore) correctly resolves to non-dev key in tests |

## Residual Manual Steps (Not Code)

The following steps must be performed manually in Vercel + Clerk Dashboard:

1. **Clerk Dashboard**: Create production application instance
2. **Clerk Dashboard**: Configure allowed redirect URLs for Vercel production + preview domains
3. **Vercel Dashboard**: Update `CLERK_SECRET_KEY` to `sk_live_...` value
4. **Vercel Dashboard**: Update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to `pk_live_...` value
5. **E2E**: Re-create test users in production Clerk instance and update E2E env vars
6. **Auth Matrix**: Re-verify all Critical scenarios in `AUTH_FLOW_VERIFICATION_MATRIX.md`

## Status

**COMPLETE** — code changes done, tests pass, manual steps documented.
