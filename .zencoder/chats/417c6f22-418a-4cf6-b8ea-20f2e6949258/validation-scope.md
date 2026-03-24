# Validation Scope Definition

**Branch**: `feat/drizzle`  
**Date**: 2026-03-24

---

## Minimum Required Validation — COMPLETED

These must all pass before the branch is considered safe for PR.

| Check                | Command                 | Status                               |
| -------------------- | ----------------------- | ------------------------------------ |
| TypeScript typecheck | `pnpm typecheck`        | ✅ PASS                              |
| ESLint               | `pnpm lint`             | ✅ PASS                              |
| Unit tests           | `pnpm test`             | ✅ PASS (117 files, 778 tests)       |
| Integration tests    | `pnpm test:integration` | ✅ PASS (14 files, 69 tests)         |
| Architecture lint    | `pnpm skott:check:only` | ✅ PASS (0 circular deps, 371 files) |
| Dependency check     | `pnpm depcheck`         | ✅ PASS (No depcheck issues)         |

---

## Specific Scenarios Verified

### Auth Flow

- Unauthenticated user → `/sign-in` redirect ✅ (integration test)
- Authenticated user on auth route → `/auth/bootstrap/start` redirect ✅ (integration + E2E)
- Clerk callback state passthrough (prevents premature redirect) ✅ (integration test)
- Incomplete onboarding → `/onboarding` redirect ✅ (integration test)
- E2E bypass guard correct ✅ (integration test)

### Security Pipeline

- Public routes get security headers ✅ (integration test)
- Internal API blocked without key ✅ (integration test)
- Internal API allowed with key ✅ (integration test)
- Rate limit headers on API routes ✅ (integration test)
- 429 when rate limit exceeded ✅ (integration test)

### Authorization (RBAC/ABAC)

- PolicyEngine unit tests ✅
- ConditionEvaluator unit tests ✅
- `DefaultAuthorizationService` unit tests ✅
- Drizzle repository unit tests (mocked) ✅

---

## Optional Additional Validation — NOT BLOCKING

These are recommended but not required to block this PR.

| Check                    | Command                                | Notes                                                             |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------------- |
| DB integration tests     | `pnpm test:db` or `pnpm test:db:local` | Require running PGlite or Postgres; CI handles via `db-tests.yml` |
| E2E auth flow full run   | `pnpm e2e`                             | Requires real Clerk instance + provisioned test user credentials  |
| E2E provisioning runtime | `pnpm e2e`                             | Requires Clerk instance with org mode configured                  |
| Storybook tests          | `pnpm test:storybook`                  | Visual regression, not blocking for this branch scope             |
| Chromatic                | CI only                                | Visual regression, not blocking                                   |

**Rationale for optional status**: DB tests and E2E tests require external services (PGlite runtime, Clerk) that are not always available in local validation context. The CI workflow (`db-tests.yml`, `e2e-matrix.yml`) covers these. All unit-testable behavior is covered in the minimum required set.

---

## Validation Not Required — EXPLICITLY EXCLUDED

- **Prisma provider tests**: Not implemented, not expected
- **Stripe billing integration tests**: `StripeBillingService` is a stub — billing integration is out of scope for this branch
- **OpenFeature production tests**: `OpenFeatureFeatureFlagService` is a stub — feature flags are out of scope
- **AuthJS integration tests**: `AuthJsRequestIdentitySource` is a stub — out of scope for this branch
- **Supabase integration tests**: `SupabaseRequestIdentitySource` is a stub — out of scope for this branch
- **Lighthouse performance tests**: Out of scope for this infrastructure branch
- **Production deployment smoke tests**: Require production Vercel + Clerk instance
