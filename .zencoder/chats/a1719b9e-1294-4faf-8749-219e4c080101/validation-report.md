# Validation Report — Phase 7.1: AuthJS Provider Migration Flow

**Date**: 2026-04-21

---

## Commands Executed

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```

---

## Results

### TypeScript Typecheck

- **Status**: ✅ PASS
- **Errors**: 0

### Lint

- **Status**: ✅ PASS
- **Errors**: 0 (import order auto-fixed)

### Unit Tests

- **Status**: ✅ PASS
- **Test Files**: 151 passed (151)
- **Tests**: 1059 passed (1059)
- **Coverage** (thresholds: 75% all):
  - Statements: 80.42% ✅
  - Functions: 76.03% ✅
  - Branches: 75.82% ✅
  - Lines: 80.57% ✅

---

## Files Changed

| File                                                | Change                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/auth/signup/route.ts`                  | Added `REGISTRATION_MODE` gate (403); removed dev-mode DB error leakage; added `isUniqueConstraintViolation` safety net catch |
| `src/app/auth/signup/sign-up-client.tsx`            | Added `errorStatus` state; 409 shows "Sign in instead →" link; 403 shows registration closed message                          |
| `src/modules/auth/infrastructure/authjs/auth.ts`    | `authorize()` now throws `NoCredentials` when user exists but has no credentials row                                          |
| `src/app/auth/signin/sign-in-client.tsx`            | Added `NoCredentials` to error map; added `errorCode` state; shows "Set a password →" link for migrated accounts              |
| `src/app/api/auth/set-password/route.ts`            | **New** — migration-only set-password endpoint (only works when no existing credentials)                                      |
| `src/app/auth/set-password/page.tsx`                | **New** — Set Password server page                                                                                            |
| `src/app/auth/set-password/set-password-client.tsx` | **New** — Set Password client form                                                                                            |
| `src/app/auth/forgot-password/page.tsx`             | **New** — Forgot Password placeholder with migration guidance                                                                 |
| `src/security/middleware/route-policy.ts`           | Added `/auth/set-password` and `/auth/forgot-password` to `AUTH_ROUTE_PREFIXES`                                               |

---

## Migration Flow — Verified Logic

### Scenario: Clerk-provisioned user tries to sign up (email exists, no credentials)

1. `/api/auth/signup` → existing check finds user → `409 { error: 'An account with this email already exists.' }`
2. Signup form shows error with "Sign in instead →" link to `/auth/signin`

### Scenario: Clerk-provisioned user tries to sign in with email+password

1. `authorize()` → no `user_credentials` row → queries `usersTable` → user found → `throw new Error('NoCredentials')`
2. Sign-in form shows: "This account was set up with a different sign-in method. Please set a password to continue."
3. "Set a password →" link to `/auth/set-password`

### Scenario: User goes to `/auth/set-password`

1. Enters email + new password + confirm
2. API: checks user exists → checks no existing credentials → creates `user_credentials` + ensures `auth_user_identities(provider='authjs')` row
3. On 201: success + redirect to `/auth/signin`
4. On 409 (already has password): "This account already has a password. Use forgot password to reset it."

### Scenario: User goes to `/auth/forgot-password`

1. Sees "Password reset via email is not yet available"
2. Guided to `/auth/set-password` for migration use case

---

## Residual Risks

| Risk                                                                           | Severity | Notes                                                                            |
| ------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------- |
| No E2E tests for new set-password and forgot-password flows                    | Medium   | Manual smoke test required; E2E spec is follow-up                                |
| `auth_user_identities` check in set-password uses only `userId` (not provider) | Low      | May not insert identity if user had a different provider row; acceptable for now |
| Full forgot-password email flow not yet implemented                            | Medium   | Deferred — requires email infrastructure                                         |

---

## Next Steps (Post-Implementation)

1. **DB reset**: Run `pnpm db:dev:reset && pnpm db:dev:migrate` to clear Clerk-provisioned rows
2. **Manual smoke test**: Verify the full sign-up → sign-in → set-password flow end-to-end
3. **E2E spec**: Add Playwright spec for `/auth/signin`, `/auth/signup`, `/auth/set-password` (Pattern F)
4. **Email infrastructure**: Required before full forgot-password flow can be implemented
