# 07 — Playwright E2E Summary

**Task**: Admin Access Regression — E2E Test Design  
**Date**: 2026-04-25  
**Status**: Complete

## Tests Designed and Implemented

### New Files

| File                         | Purpose                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `e2e/authjs-auth.ts`         | AuthJS E2E sign-in helper (replaces Clerk dependency for AuthJS runtimes) |
| `e2e/authjs-session.spec.ts` | Session endpoint health regression guard                                  |

### Modified Files

| File                      | Change                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `e2e/admin.spec.ts`       | Replaced `signInE2E` (Clerk) with `signInAuthjsE2E` (AuthJS). Added `isAuthjsRuntime()` gate. |
| `e2e/admin-users.spec.ts` | Same Clerk → AuthJS replacement.                                                              |

## Key Regression Test: `authjs-session.spec.ts`

This test is the primary guard against CLIENT_FETCH_ERROR recurrence:

```typescript
test('/api/auth/session does NOT return HTML (CLIENT_FETCH_ERROR regression guard)', async ({
  request,
}) => {
  const response = await request.get('/api/auth/session');
  const text = await response.text();
  expect(text).not.toMatch(/<!DOCTYPE html>/i);
  expect(text).not.toMatch(/<html/i);
});
```

**Run condition**: `test.skip(!isAuthjsRuntime(), ...)` — only runs when `AUTH_PROVIDER=authjs`.

## Credentials Required for Authenticated Tests

Set in `.env.local` or `process.env`:

```text
E2E_AUTHJS_USER_EMAIL=<email in ADMIN_USER_EMAILS>
E2E_AUTHJS_USER_PASSWORD=<credentials provider password>
```

Without these, all authenticated admin tests are skipped gracefully.

## Previous Spec Issues Fixed

The previous `admin.spec.ts` and `admin-users.spec.ts` imported `signInE2E` and `hasClerkE2ECredentials` from `clerk-auth.ts`, which is incompatible with `AUTH_PROVIDER=authjs`. These would never run authenticated tests in an AuthJS environment. Now they use the `authjs-auth.ts` helper.

## Coverage

| Scenario                                           | Test                                                      |
| -------------------------------------------------- | --------------------------------------------------------- |
| Unauthenticated redirect from `/admin`             | `admin.spec.ts` — runs always                             |
| Unauthenticated redirect from `/admin/waitlist`    | `admin.spec.ts` — runs always                             |
| Unauthenticated redirect from `/admin/invitations` | `admin.spec.ts` — runs always                             |
| Unauthenticated redirect from `/admin/users`       | `admin-users.spec.ts` — runs always                       |
| Session endpoint returns JSON                      | `authjs-session.spec.ts` — AuthJS only                    |
| Session endpoint not returning HTML                | `authjs-session.spec.ts` — AuthJS only (regression guard) |
| Providers endpoint returns JSON                    | `authjs-session.spec.ts` — AuthJS only                    |
| Authenticated admin hub access                     | `admin.spec.ts` — AuthJS + credentials                    |
| Authenticated admin users page                     | `admin-users.spec.ts` — AuthJS + credentials              |
