# Onboarding Entry Hardening — Implementation Report

**Session ID**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Agent**: Implementation Agent  
**Date**: 2026-03-17  
**Status**: IMPLEMENTED

---

## 1. Objective

Implement the minimum safe onboarding-entry hardening pass:

1. Add visible onboarding loading UI (`loading.tsx`) — eliminates blank screen during route settlement
2. Add structured observability to `OnboardingGuard` — makes the guard entry/exit diagnosable
3. Evaluate `onboarding-form.tsx` pattern change — deferred (see below)

---

## 2. Affected Files / Modules

| File                                     | Change          | Layer          | Touches                                                      |
| ---------------------------------------- | --------------- | -------------- | ------------------------------------------------------------ |
| `src/app/onboarding/loading.tsx`         | **CREATED**     | `app` delivery | Loading UI only — no contracts, no auth, no DI               |
| `src/app/onboarding/layout.tsx`          | **MODIFIED**    | `app` delivery | Logging only — no behavioral change, no redirect rule change |
| `src/app/onboarding/onboarding-form.tsx` | **NOT CHANGED** | `app` delivery | Deferred — see §6                                            |

No contracts changed. No auth/security flow changed. No DI composition changed. No public behavior changed.

---

## 3. Implementation Plan

1. Read context files: `REPOSITORY_AI_CONTEXT.md`, `plan.md`, analysis artifacts
2. Inspect affected files: `layout.tsx`, `onboarding-form.tsx`, `actions.ts`, `page.tsx`
3. Inspect existing patterns: `security-showcase/loading.tsx`, `users/layout.tsx` (logger + `getServerRequestLogContext`)
4. Implement `loading.tsx` — segment-level skeleton matching onboarding container dimensions
5. Add logging to `OnboardingGuard` — following `users/layout.tsx` logger conventions exactly
6. Evaluate `onboarding-form.tsx` — deferred (requires action signature change, out of scope)
7. Run full validation suite

---

## 4. Changes Made

### 4.1 `src/app/onboarding/loading.tsx` — CREATED

New file. Next.js App Router segment-level loading convention. Displayed immediately when navigating to `/onboarding` while the server renders `OnboardingGuard`.

- Container dimensions match `OnboardingLayout` wrapper: `container mx-auto max-w-2xl px-4 py-12`
- Card skeleton matches `OnboardingForm` card: `bg-card rounded-lg border p-8 shadow-sm`
- Skeleton rows match form structure: title, subtitle, 3 field rows (displayName, locale, timezone), submit button
- Uses `animate-pulse` + `bg-zinc-200 dark:bg-zinc-800` — exact same pattern as `security-showcase/loading.tsx`
- Pure presentational — no imports, no logic

**Effect**: Eliminates the blank screen between `/users` redirect and onboarding form render. The router now commits the loading skeleton immediately on navigation, then replaces it with the streamed RSC content.

### 4.2 `src/app/onboarding/layout.tsx` — MODIFIED (logging only)

Added imports:

- `resolveServerLogger` from `@/core/logger/di`
- `getServerRequestLogContext` from `@/shared/lib/observability/server-request-log-context`

Added module-level logger (matching `users/layout.tsx` convention):

```tsx
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'onboarding-guard',
});
```

Added `getServerRequestLogContext({ pathname: '/onboarding' })` at start of `OnboardingGuard`.

Added structured log events (all use `correlationId`, `requestId` for tracing):

| Event                                                          | Level   | Trigger                                                        |
| -------------------------------------------------------------- | ------- | -------------------------------------------------------------- |
| `onboarding_guard:entry`                                       | `debug` | Guard starts — before any DB work                              |
| `onboarding_guard:identity_lookup` (status: `not_provisioned`) | `warn`  | `UserNotProvisionedError` caught → redirect bootstrap          |
| `onboarding_guard:identity_lookup` (status: `error`)           | `error` | Any other identity error → redirect bootstrap db-error         |
| `onboarding_guard:identity_lookup` (status: `no_identity`)     | `warn`  | Identity resolves to null → redirect sign-in                   |
| `onboarding_guard:identity_lookup` (status: `success`)         | `debug` | Identity resolved — before user lookup                         |
| `onboarding_guard:user_lookup` (status: `error`)               | `error` | `userRepository.findById` throws → redirect bootstrap db-error |
| `onboarding_guard:user_lookup` (status: `not_found`)           | `warn`  | User not found → redirect bootstrap                            |
| `onboarding_guard:decision` (status: `already_complete`)       | `info`  | `user.onboardingComplete === true` → redirect /users           |
| `onboarding_guard:decision` (status: `onboarding_required`)    | `info`  | Guard passes — rendering onboarding form                       |

**No behavioral changes**: All redirect targets, redirect conditions, error handling logic, and container resolution are identical to the original. Only log statements added. The `catch` blocks now capture `err` in the user lookup catch (changed from anonymous `catch {` to `catch (err) {`) solely for logging — redirect behavior identical.

---

## 5. Validation / Verification

All commands ran from project root.

### typecheck — PASS

```
pnpm typecheck → tsc --noEmit → Exit 0
```

### lint — PASS

```
pnpm lint → eslint → Exit 0
```

### arch:lint — PASS

```
pnpm arch:lint → Exit 0
- PASS: core must not import app/features/security/modules outside composition root
- PASS: shared must remain neutral
- PASS: modules must not depend on app/features/security
- PASS: security must not directly depend on app/features/modules
- PASS: Clerk must not leak into core/shared/security/authorization/features
- PASS: client components importing obvious server-only modules
- PASS: edge-sensitive files must not import obvious node-only modules
- PASS: skott dependency graph check (no circular dependencies)
- PASS: madge circular dependency check
- Architecture lint passed.
Note: existing WARN for global container usage in request-sensitive flows (pre-existing, not introduced here)
```

### test — PASS (pre-existing failures excluded)

```
762 tests run: 761 passed, 1 failed
- 1 failure: DrizzleUserRepository.db.test.ts 'updates profile fields' — timeout (real Postgres not available in test env)
- This failure is pre-existing and unrelated to these changes
```

**OnboardingGuard tests: all 7 pass**

```
✓ redirects externally-authenticated but unprovisioned users to bootstrap
✓ redirects to bootstrap db-error when getCurrentIdentity throws a non-UserNotProvisionedError
✓ redirects to bootstrap db-error when userRepository.findById throws
✓ redirects unauthenticated users to sign-in
✓ redirects to bootstrap when the internal user row is missing
✓ redirects onboarded users to /users
✓ renders children for provisioned users with incomplete onboarding
```

**Onboarding action tests: all pass**

```
✓ executes provisioning before writing profile and onboarding status, then redirects to /users
✓ redirects to sanitized custom redirect_url from formData on success
✓ returns controlled error for tenant-context provisioning failure
✓ returns database error when provisioning succeeds but the internal user row is missing
✓ returns database error when userRepository.findById throws after successful provisioning
```

---

## 6. `onboarding-form.tsx` — Explicitly Deferred

**Decision: Deferred. Not changed in this pass.**

**Reason**: Migrating to `form action={completeOnboarding}` + `useFormStatus()` is not low-risk without also changing the server action signature. The `completeOnboarding` action returns `{ error: string }` on validation/provisioning failures. To capture this with the idiomatic pattern requires `useActionState(completeOnboarding, null)`, which requires changing the action signature to `(prevState: ..., formData: FormData) => ...`. This:

- Changes the public contract of `completeOnboarding`
- Requires updating `actions.test.ts`
- Risks redirect behavior changes if `useActionState` wrapping affects how Next.js 16 handles the `redirect()` call inside the action

This is a medium-blast-radius change that should be a separate, focused pass with explicit approval. The current `form action={handleSubmit}` pattern is functional — the form submits, the server action runs, and errors are displayed. The non-idiomatic pattern creates no confirmed hang.

**Recommended next step**: Separate implementation pass for form migration, after confirming the action signature change is approved.

---

## 7. Risks / Follow-ups

| Item                                                   | Severity | Notes                                                                                                                                                                                                  |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onboarding-form.tsx` non-idiomatic pattern            | Low      | Deferred. Functional but should be modernized separately.                                                                                                                                              |
| `<Suspense fallback={null}>` inside `OnboardingLayout` | Low      | `loading.tsx` handles the navigation-transition blank screen. The inner Suspense still shows null for within-page streaming suspension — acceptable given `loading.tsx` now covers the primary UX gap. |
| `completeOnboarding` redundant `ensureProvisioned`     | Low      | Pre-existing. Not addressed here per task scope. Architecture review recommended before removal.                                                                                                       |
| Pre-existing DB test timeout                           | None     | `DrizzleUserRepository.db.test.ts` timeout is a test infrastructure issue (no live Postgres in CI). Not introduced by this change.                                                                     |
