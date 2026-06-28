# Validation Report — 2026-04-21-authjs-phase72

**Date**: 2026-04-22
**Status**: ✅ PASSED

## Unit Tests

| Metric              | Before  | After   |
| ------------------- | ------- | ------- |
| Tests passing       | 1059    | 1086    |
| New tests added     | —       | 27      |
| Coverage (branches) | >75% ✅ | >75% ✅ |

## New Test Files

- `src/core/env.test.ts` — +9 `validateVerificationConfigValues` tests
- `src/modules/auth/infrastructure/authjs/auth.test.ts` — +1 `EmailNotVerified` throw
- `src/app/api/auth/signup/route.test.ts` — 10 tests (new file)
- `src/app/api/auth/resend-verification/route.test.ts` — 7 tests (new file)

## Static Analysis

```text
pnpm typecheck → exit 0 ✅
pnpm lint --fix → exit 0 ✅
```

## E2E Specs (Pattern F Compliance)

- `e2e/authjs-verify-email.spec.ts` created with 10 specs
- Specs skip automatically when `AUTH_PROVIDER !== authjs`
- Covers: verify-email page (no token, invalid token, link present), verify-email-pending page (heading, messaging, form, sign-in link), sign-in `verified=true` banner

## Security Properties Validated

| Property                                                          | Status |
| ----------------------------------------------------------------- | ------ |
| Unverified email blocked at `authorize()`                         | ✅     |
| Token consume is atomic (UPDATE … WHERE usedAt IS NULL RETURNING) | ✅     |
| TOCTOU-safe — no SELECT then UPDATE                               | ✅     |
| Token stored as SHA-256 hash                                      | ✅     |
| Token single-use (usedAt set on consume)                          | ✅     |
| Raw email NOT in verify-email-pending URL                         | ✅     |
| Dual-key brute force: IP + identifier hash                        | ✅     |
| Identifier hash: sha256(lowercase(trim(email)))                   | ✅     |
| Dev bypass flags banned in production (startup validation)        | ✅     |
| Capability-aware copy — no false "email sent" claims              | ✅     |
| Dead-end signup prevented by config invariant                     | ✅     |
| Signup write path fully transactional (4 inserts)                 | ✅     |
| Resend token replacement is transactional (DELETE + INSERT)       | ✅     |

## Residual Risks (Documented)

| Risk                                                                 | Severity | Status                                                  |
| -------------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| No real email delivery adapter                                       | HIGH     | Mitigated — `REGISTRATION_MODE=closed` required in prod |
| Session invalidation after password reset                            | MEDIUM   | Deferred — documented as known limitation               |
| `REGISTRATION_MODE=open` in production blocked by startup validation | —        | Enforced                                                |
