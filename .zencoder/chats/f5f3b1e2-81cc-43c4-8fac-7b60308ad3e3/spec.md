# Technical Specification

## Auth, Authorization & Provisioning — Production Hardening

**PRD:** `requirements.md` (same directory)  
**Plan:** `plan.md` (same directory) — this spec is subordinate to plan.md; plan.md is authoritative  
**Language:** TypeScript 5, Next.js 16 App Router (Node.js RSC + Edge Middleware)  
**Package Manager:** pnpm  
**DB:** Drizzle ORM + PostgreSQL / PGlite

---

## 1. Technical Context

### Current Architecture

| Layer                 | File                                                               | Role                                              |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| Root Layout           | `src/app/layout.tsx`                                               | ClerkProvider with redirect props                 |
| Header Modal Auth     | `src/modules/auth/ui/HeaderAuthControls.tsx`                       | Clerk modal SignInButton / SignUpButton           |
| Edge Middleware       | `src/proxy.ts`                                                     | Clerk wrapper + security pipeline                 |
| Edge Auth             | `src/security/middleware/with-auth.ts`                             | Session presence gate, route classification       |
| Edge Route Classifier | `src/security/middleware/route-classification.ts`                  | Classifies route type                             |
| Edge Route Policy     | `src/security/middleware/route-policy.ts`                          | Public/auth route prefix lists                    |
| Node Access Gate      | `src/security/core/node-provisioning-access.ts`                    | 6-state access machine                            |
| Node Access Runtime   | `src/security/core/node-provisioning-runtime.ts`                   | Resolves deps + calls gate                        |
| Node API Wrapper      | `src/security/api/with-node-provisioning.ts`                       | API route guard with HTTP mapping                 |
| Protected Layout      | `src/app/users/layout.tsx`                                         | RSC guard with redirect mapping                   |
| Onboarding Layout     | `src/app/onboarding/layout.tsx`                                    | RSC guard for onboarding access                   |
| Onboarding Page       | `src/app/onboarding/page.tsx`                                      | Client form with domain-specific fields           |
| Onboarding Action     | `src/modules/auth/ui/onboarding-actions.ts`                        | Server action — current primary provisioning path |
| Contracts             | `src/core/contracts/provisioning-access.ts`                        | Public state types                                |
| User Contract         | `src/core/contracts/user.ts`                                       | User aggregate interface                          |
| User Schema           | `src/modules/user/infrastructure/drizzle/schema.ts`                | Drizzle users table                               |
| Drizzle User Repo     | `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` | Drizzle user repo                                 |
| Clerk User Repo       | `src/modules/auth/infrastructure/ClerkUserRepository.ts`           | Clerk metadata user repo                          |
| JWT Type Declarations | `src/types/globals.d.ts`                                           | CustomJwtSessionClaims with profile fields        |
| Auth Env              | `src/core/env.ts`                                                  | T3-Env config — Clerk redirect URLs               |

### Critical Gaps

1. No `BOOTSTRAP_REQUIRED` state — `UserNotProvisionedError` and null user both collapse into `ONBOARDING_REQUIRED`.
2. No `/auth/bootstrap` route — the primary Node write path is missing.
3. `completeOnboarding()` is the only `ensureProvisioned()` caller — onboarding is the primary provisioning trigger.
4. Clerk sign-in/sign-up redirect to `/onboarding` or `/` — bootstrap route bypassed.
5. `HeaderAuthControls.tsx` modal `SignInButton` has no `forceRedirectUrl` — modal sign-in bypasses bootstrap.
6. `SignUpButton` `signInForceRedirectUrl` is wired to the fallback URL — cross-link in modal uses wrong redirect.
7. `ClerkProvider` in `layout.tsx` does not pass `signInForceRedirectUrl`/`signUpForceRedirectUrl` props.
8. Domain-specific user schema fields (`target_language`, `proficiency_level`, `learning_goal`) in DB schema, DrizzleUserRepository, ClerkUserRepository, user contract, JWT type declarations.
9. Redirect target is lost when bootstrap → onboarding redirect occurs — onboarding completion hardcoded to `/users`.
10. Protected API `with-node-provisioning.ts` has no `BOOTSTRAP_REQUIRED` handling.
11. `/auth/bootstrap` not recognized by route classification.

---

## 2. Implementation Approach

### 2.1 State Machine Extension

**File:** `src/security/core/node-provisioning-access.ts`

Add `BOOTSTRAP_REQUIRED` as a distinct status:

```typescript
export type NodeProvisioningAccessStatus =
  | 'ALLOWED'
  | 'UNAUTHENTICATED'
  | 'BOOTSTRAP_REQUIRED' // NEW: external session + no internal record
  | 'ONBOARDING_REQUIRED' // KEPT: internal user exists, onboarding not complete
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'FORBIDDEN';
```

Logic change in `evaluateNodeProvisioningAccess`:

- `UserNotProvisionedError` thrown by `identityProvider.getCurrentIdentity()` → `BOOTSTRAP_REQUIRED`
- User record missing in DB after identity resolution → `BOOTSTRAP_REQUIRED`
- User exists but `onboardingComplete === false` → `ONBOARDING_REQUIRED` (unchanged)

**File:** `src/core/contracts/provisioning-access.ts`

Add `BOOTSTRAP_REQUIRED` to both `ProvisioningAccessDenyStatus` and `ProvisioningApiErrorCode`.

### 2.2 Bootstrap Route

**New file:** `src/app/auth/bootstrap/page.tsx`

Server component (Node runtime). Orchestrates bootstrap flow:

1. Read `redirect_url` from awaited `searchParams`.
2. Sanitize: `safeTarget = sanitizeRedirectUrl(redirect_url, '/users')`.
3. Resolve `AUTH.IDENTITY_SOURCE` from `getAppContainer()` → call `.get()`.
4. If `rawIdentity.userId` is falsy → `redirect('/sign-in')`.
5. Call `PROVISIONING.SERVICE.ensureProvisioned(...)` inside try/catch.
6. On `CrossProviderLinkingNotAllowedError` → render `<BootstrapErrorUI error="cross_provider_linking" />`.
7. On `TenantUserLimitReachedError` → render `<BootstrapErrorUI error="quota_exceeded" />`.
8. On `TenantContextRequiredError` / `TenantNotProvisionedError` → render `<BootstrapErrorUI error="tenant_config" />`.
9. On success → resolve user via `AUTH.USER_REPOSITORY.findById(internalUserId)`.
10. If `!user.onboardingComplete` → `redirect('/onboarding?redirect_url=' + encodeURIComponent(safeTarget))` — **target preserved**.
11. Else → `redirect(safeTarget)`.

**New file:** `src/app/auth/bootstrap/bootstrap-error.tsx` — Client component:

- Props: `error: 'cross_provider_linking' | 'quota_exceeded' | 'tenant_config'`
- Renders human-readable error message (no internal details).
- "Try Again" → `window.location.reload()`.
- "Sign out" → calls Clerk `useClerk().signOut()` then navigates to `/sign-in`.
- **Scope note**: Clerk-specific sign-out is intentional here. This component is only rendered when `AUTH_PROVIDER=clerk`. Documented as known debt for future provider-agnostic abstraction.

**New file:** `src/shared/lib/routing/safe-redirect.ts`

- `isValidInternalRedirect(url: string): boolean` — rejects external URLs, `//`, `http`, empty, `javascript:`
- `sanitizeRedirectUrl(url: string, fallback: string): string`

### 2.3 Route Classification

**File:** `src/security/middleware/route-classification.ts`

Add `isBootstrapRoute: boolean` to `RouteContext`:

```typescript
const isBootstrapRoute =
  path === '/auth/bootstrap' || path.startsWith('/auth/bootstrap/');
```

**File:** `src/security/middleware/with-auth.ts`

Bootstrap route passthrough: if `ctx.isBootstrapRoute` and user has external session → pass to handler (skip onboarding redirect and unauthenticated rejection for missing internal state). If no session on bootstrap route → redirect to sign-in.

### 2.4 Protected Layout Updates

**File:** `src/app/users/layout.tsx`

Add `BOOTSTRAP_REQUIRED` mapping before `ONBOARDING_REQUIRED`:

```typescript
if (access.status === 'BOOTSTRAP_REQUIRED') {
  redirect('/auth/bootstrap?redirect_url=/users');
}
```

### 2.5 Protected API Updates

**File:** `src/security/api/with-node-provisioning.ts`

Add before `ONBOARDING_REQUIRED` branch:

```typescript
if (outcome.status === 'BOOTSTRAP_REQUIRED') {
  return createServerErrorResponse(
    'Bootstrap required',
    409,
    'BOOTSTRAP_REQUIRED',
  );
}
```

### 2.6 Env Configuration

**File:** `src/core/env.ts`

Changes:

- Add `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` (default: `/auth/bootstrap`)
- Add `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` (default: `/auth/bootstrap`) — add to schema and runtimeEnv
- Change `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` default: `/` → `/auth/bootstrap`
- Change `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` default: `/` → `/auth/bootstrap`

**File:** `.env.example` — Updated entries.

### 2.7 ClerkProvider Redirect Props

**File:** `src/app/layout.tsx`

Add `signInForceRedirectUrl` and `signUpForceRedirectUrl` to `ClerkProvider`:

```tsx
<ClerkProvider
  signInUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
  signUpUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_URL}
  waitlistUrl={env.NEXT_PUBLIC_CLERK_WAITLIST_URL}
  signInFallbackRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL}
  signUpFallbackRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL}
  signInForceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL}
  signUpForceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL}
>
```

### 2.8 HeaderAuthControls Modal Redirect Props

**File:** `src/modules/auth/ui/HeaderAuthControls.tsx`

The header modal buttons are an independent Clerk entrypoint and override `ClerkProvider` props. Currently:

- `SignInButton` has no `forceRedirectUrl` — modal sign-in bypasses bootstrap.
- `SignUpButton` has `signInForceRedirectUrl` wired to the fallback URL (bug).

Required final shape:

```tsx
<SignInButton
  mode="modal"
  forceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL}
  fallbackRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL}
  signUpFallbackRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL}
  signUpForceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL}
>

<SignUpButton
  mode="modal"
  forceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL}
  signInFallbackRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL}
  signInForceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL}
>
```

### 2.9 DB Schema Migration — Generic Profile Fields

**File:** `src/modules/user/infrastructure/drizzle/schema.ts`

Replace:

- `targetLanguage: text('target_language')`
- `proficiencyLevel: text('proficiency_level')`
- `learningGoal: text('learning_goal')`

With:

- `displayName: text('display_name')`
- `locale: text('locale')`
- `timezone: text('timezone')`

Generate migration: `pnpm db:generate`.

### 2.10 User Contract and All Repository Implementations

**File:** `src/core/contracts/user.ts`

- Replace `targetLanguage`, `proficiencyLevel`, `learningGoal` with `displayName`, `locale`, `timezone`.
- Update `updateProfile()` signature.

**File:** `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`

- Update `findById()` select and `updateProfile()` method.

**File:** `src/modules/auth/infrastructure/ClerkUserRepository.ts`

- Update `findById()` to return `displayName`, `locale`, `timezone` from `publicMetadata`.
- Update `updateProfile()` signature and implementation.
- These are convenience cache fields in Clerk `publicMetadata`, not auth correctness dependencies.

**File:** `src/modules/auth/infrastructure/ClerkUserRepository.test.ts`

- Replace all `targetLanguage`/`proficiencyLevel` test fixtures and assertions with `displayName`/`locale`/`timezone`.

**File:** `src/types/globals.d.ts`

- Remove `targetLanguage`, `proficiencyLevel`, `learningGoal` from `CustomJwtSessionClaims.metadata`.
- Add `displayName`, `locale`, `timezone`.

### 2.11 Onboarding Refactor

**File:** `src/modules/auth/ui/onboarding-actions.ts`

- Read `displayName` (required), `locale` (optional), `timezone` (optional), `redirect_url` (optional) from `formData`.
- Validate `displayName`; return error if missing.
- Sanitize `redirect_url` with `sanitizeRedirectUrl(rawRedirect, '/users')`.
- Call `userRepository.updateProfile(identity.id, { displayName, locale, timezone })`.
- Return `{ message: 'Onboarding completed', redirectUrl: safeRedirectUrl }`.

**File:** `src/app/onboarding/page.tsx`

- Read `redirect_url` from awaited `searchParams`; sanitize it.
- Replace LingoLearn form with generic profile form:
  - `displayName`: text input, required.
  - `locale`: optional select (common locales).
  - `timezone`: optional select (common timezones).
  - `<input type="hidden" name="redirect_url" value={safeRedirectUrl} />` — carries target through form.
- After success: `router.push(res.redirectUrl ?? '/users')` — preserved target, not hardcoded.
- Remove `useUser` / `user.reload()`.

**File:** `src/app/onboarding/layout.tsx`

- **Remove `UserNotProvisionedError` bootstrap path** (lines 32–39): replace the catch block that renders children for unprovisioned users with `redirect('/auth/bootstrap')`. An unprovisioned user must go through bootstrap, not through the onboarding form.
- Change `redirect('/')` → `redirect('/users')` when `onboardingComplete === true`.
- Remove legacy comments referencing onboarding as provisioning entrypoint.

Final layout behavior:

- No external session → `redirect('/sign-in')`
- `UserNotProvisionedError` → `redirect('/auth/bootstrap')` ← **key security fix**
- Identity OK + `onboardingComplete: true` → `redirect('/users')`
- Identity OK + `onboardingComplete: false` → render children

### 2.12 Auth-Route Recovery Fix

**File:** `src/security/middleware/with-auth.ts`

`redirectAuthenticatedFromAuthRoute()` currently redirects authenticated users on auth routes to `/` or `/onboarding` based on `onboardingComplete`. This bypasses bootstrap for unprovisioned sessions.

Required change:

- Remove the `onboardingComplete` conditional
- Extract any `redirect_url` from the auth route's search params and forward it to bootstrap
- Always redirect authenticated users to `/auth/bootstrap` (with forwarded `redirect_url` if present)

```typescript
function redirectAuthenticatedFromAuthRoute(
  req: NextRequest,
  ctx: RouteContext,
  userId: string | undefined,
): NextResponse | null {
  if (!userId || !ctx.isAuthRoute) return null;
  const bootstrapUrl = new URL('/auth/bootstrap', req.url);
  const redirectUrl = req.nextUrl.searchParams.get('redirect_url');
  if (redirectUrl) {
    bootstrapUrl.searchParams.set('redirect_url', redirectUrl);
  }
  return NextResponse.redirect(bootstrapUrl);
}
```

The function signature loses the `onboardingComplete` parameter — update all call sites.

### 2.13 SecurityContext Typed Readiness + Secure Action Responses (with Edge/Node boundary enforcement)

**Critical constraint**: `EdgeSecurityDependencies` is an alias of `SecurityContextDependencies`. Adding `userRepository` to the shared base would leak a Node/DB dependency into the Edge contract. Instead, a new `NodeSecurityContextDependencies` interface is introduced.

**File:** `src/security/core/security-dependencies.ts` — Split the hierarchy:

```typescript
export interface BaseSecurityDependencies {
  identityProvider: IdentityProvider;
  tenantResolver: TenantResolver;
}
export interface NodeSecurityContextDependencies extends BaseSecurityDependencies {
  userRepository: UserRepository;
}
export type EdgeSecurityDependencies = BaseSecurityDependencies;
export interface NodeSecurityDependencies extends BaseSecurityDependencies {
  authorizationService: AuthorizationService;
}
export type SecurityContextDependencies = BaseSecurityDependencies;
export type SecurityDependencies =
  | EdgeSecurityDependencies
  | NodeSecurityDependencies;
```

**File:** `src/security/core/security-context.ts`

- Change `createSecurityContext()` parameter: `SecurityContextDependencies` → `NodeSecurityContextDependencies`
- Add `readinessStatus` to `SecurityContext`:

```typescript
export interface SecurityContext {
  readinessStatus:
    | 'ALLOWED'
    | 'BOOTSTRAP_REQUIRED'
    | 'ONBOARDING_REQUIRED'
    | 'TENANT_CONTEXT_REQUIRED'
    | 'TENANT_MEMBERSHIP_REQUIRED'
    | 'UNAUTHENTICATED';
  user?: { id: string; tenantId: string; attributes?: Record<string, unknown> };
  // ... rest unchanged
}
```

- Mapping in `createSecurityContext()`:
  - `UserNotProvisionedError` → `readinessStatus: 'BOOTSTRAP_REQUIRED'`, `identity = null`
  - No identity → `readinessStatus: 'UNAUTHENTICATED'`
  - Identity OK → `userRepository.findById(identity.id)`:
    - `!user` → `readinessStatus: 'BOOTSTRAP_REQUIRED'`
    - `!user.onboardingComplete` → `readinessStatus: 'ONBOARDING_REQUIRED'`
    - User OK → proceed to tenant
  - `MissingTenantContextError` / `TenantNotProvisionedError` → `readinessStatus: 'TENANT_CONTEXT_REQUIRED'`
  - `TenantMembershipRequiredError` → `readinessStatus: 'TENANT_MEMBERSHIP_REQUIRED'`
  - All pass → `readinessStatus: 'ALLOWED'`

**File:** `src/security/actions/secure-action.ts`

Replace generic `!context.user → throw AuthorizationError` with typed readiness checks:

```typescript
if (context.readinessStatus === 'BOOTSTRAP_REQUIRED') {
  return { status: 'bootstrap_required' as const };
}
if (context.readinessStatus === 'ONBOARDING_REQUIRED') {
  return { status: 'onboarding_required' as const };
}
if (context.readinessStatus === 'TENANT_CONTEXT_REQUIRED') {
  return { status: 'tenant_context_required' as const };
}
if (context.readinessStatus === 'TENANT_MEMBERSHIP_REQUIRED') {
  return { status: 'tenant_membership_required' as const };
}
if (!context.user) {
  return { status: 'unauthorized' as const, error: 'Authentication required' };
}
```

Add new status variants to the `SecureActionResult` union type. This is a **breaking change** — all action callers must handle the new statuses.

### 2.14 Blast-Radius Consumer Updates (breaking changes from 2.12 + 2.13)

All real consumers of `SecurityContextDependencies` and `SecureActionResult` must be updated:

**`src/features/security-showcase/actions/showcase-actions.ts`**

- Import `NodeSecurityContextDependencies` and `UserRepository`
- In `createSecurityDependencies()`: resolve `AUTH.USER_REPOSITORY` from container, add to context deps

**`src/features/security-showcase/components/SettingsFormExample.tsx`**

- Handle new result statuses explicitly; `bootstrap_required` → `window.location.href = '/auth/bootstrap'`; `onboarding_required` → redirect to `/onboarding`; use `'error' in result` guard for `error` field access

**`src/security/core/security-context.mock.ts`**

- Add `readinessStatus: 'ALLOWED'` to `createMockSecurityContext()` default object

**`src/app/security-showcase/page.tsx`**

- Import `NodeSecurityContextDependencies` and `UserRepository` (instead of `SecurityContextDependencies`)
- Resolve `AUTH.USER_REPOSITORY` from container and include in dependency object
- Add `readinessStatus: 'UNAUTHENTICATED'` to both fallback `context` objects (guest path: lines 41–49; error path: lines 63–71)

**`src/testing/integration/server-actions.test.ts`**

- `getSecurityContextDependencies()`: add `userRepository` (resolve from container)
- Update `MissingTenantContextError` / `TenantNotProvisionedError` test expectations: `'unauthorized'` → `'tenant_context_required'`
- Update `TenantMembershipRequiredError` test expectations: `'unauthorized'` → `'tenant_membership_required'`
- Add tests for `UserNotProvisionedError` → `'bootstrap_required'`
- Add tests for `onboardingComplete: false` user → `'onboarding_required'`

---

## 3. Source Code Structure Changes

### New Files

```
src/app/auth/bootstrap/page.tsx                — Bootstrap RSC page (Node)
src/app/auth/bootstrap/bootstrap-error.tsx     — Bootstrap error client component
src/app/auth/bootstrap/page.test.tsx           — Bootstrap integration tests
src/app/auth/bootstrap/bootstrap-error.test.tsx
src/shared/lib/routing/safe-redirect.ts        — Redirect URL validator
src/shared/lib/routing/safe-redirect.test.ts
scripts/e2e-clerk-fixtures.md                  — E2E fixture setup guide
```

### Modified Files

```
src/core/contracts/provisioning-access.ts       — Add BOOTSTRAP_REQUIRED
src/core/contracts/user.ts                      — Generic profile fields
src/core/env.ts                                 — New/updated Clerk redirect env vars
src/security/core/node-provisioning-access.ts   — Add BOOTSTRAP_REQUIRED state
src/security/middleware/route-classification.ts  — Add isBootstrapRoute
src/security/middleware/with-auth.ts            — Bootstrap passthrough + auth-route recovery fix
src/security/api/with-node-provisioning.ts      — BOOTSTRAP_REQUIRED → 409
src/security/core/security-dependencies.ts      — Node/Edge dependency split (NodeSecurityContextDependencies)
src/security/core/security-context.ts           — Add readinessStatus field; accept NodeSecurityContextDependencies
src/security/core/security-context.mock.ts      — Add readinessStatus default to mock factory
src/security/actions/secure-action.ts           — Typed readiness responses
src/features/security-showcase/actions/showcase-actions.ts — NodeSecurityContextDependencies + userRepository
src/features/security-showcase/components/SettingsFormExample.tsx — Handle new result statuses
src/app/security-showcase/page.tsx              — NodeSecurityContextDependencies + readinessStatus in fallbacks
src/testing/integration/server-actions.test.ts  — Updated deps + updated/new test expectations
src/app/layout.tsx                              — ClerkProvider forceRedirectUrl props
src/modules/auth/ui/HeaderAuthControls.tsx      — Modal redirect props fix
src/app/users/layout.tsx                        — BOOTSTRAP_REQUIRED redirect
src/app/onboarding/layout.tsx                   — Completed redirect → /users
src/app/onboarding/page.tsx                     — Generic profile form + redirect preservation
src/modules/auth/ui/onboarding-actions.ts       — Generic fields + redirect preservation
src/modules/user/infrastructure/drizzle/schema.ts          — Generic columns
src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts — Updated
src/modules/auth/infrastructure/ClerkUserRepository.ts      — Generic fields
src/modules/auth/infrastructure/ClerkUserRepository.test.ts — Updated fixtures
src/types/globals.d.ts                          — Updated JWT claims
e2e/clerk-auth.ts                               — Extended test user helpers
e2e/provisioning-runtime.spec.ts                — Full E2E matrix
e2e/auth.spec.ts                                — Clerk redirect invariant tests
scripts/check-e2e-auth-env.mjs                  — Extended env validation
.env.example                                    — Updated defaults
```

### DB Migrations

```
src/core/db/migrations/generated/XXXX_generic_profile_fields.sql — New migration
```

---

## 4. Data Model Changes

### users table

| Column              | Change                     |
| ------------------- | -------------------------- |
| `target_language`   | **REMOVED**                |
| `proficiency_level` | **REMOVED**                |
| `learning_goal`     | **REMOVED**                |
| `display_name`      | **ADDED** (text, nullable) |
| `locale`            | **ADDED** (text, nullable) |
| `timezone`          | **ADDED** (text, nullable) |

---

## 5. API / Interface Changes

### `NodeProvisioningAccessStatus`

```
ADDED: 'BOOTSTRAP_REQUIRED'
```

### `ProvisioningAccessDenyStatus`

```
ADDED: 'BOOTSTRAP_REQUIRED'
```

### `ProvisioningApiErrorCode`

```
ADDED: 'BOOTSTRAP_REQUIRED'
```

### `User` interface

```
REMOVED: targetLanguage, proficiencyLevel, learningGoal
ADDED: displayName, locale, timezone
```

### `UserRepository.updateProfile()`

```
REMOVED params: targetLanguage, proficiencyLevel, learningGoal
ADDED params: displayName, locale, timezone
```

### `RouteContext`

```
ADDED: isBootstrapRoute: boolean
```

### `SecurityContext`

```
ADDED: readinessStatus: 'ALLOWED' | 'BOOTSTRAP_REQUIRED' | 'ONBOARDING_REQUIRED' | 'TENANT_CONTEXT_REQUIRED' | 'TENANT_MEMBERSHIP_REQUIRED' | 'UNAUTHENTICATED'
```

### `SecurityContextDependencies` (unchanged — kept as alias for BaseSecurityDependencies)

```
NO CHANGE — Edge must not depend on userRepository
```

### `NodeSecurityContextDependencies` (NEW)

```
NEW interface extending BaseSecurityDependencies:
  ADDED: userRepository: UserRepository
Used exclusively by createSecurityContext() (Node-only)
```

### `BaseSecurityDependencies` (NEW)

```
NEW interface: { identityProvider, tenantResolver }
Base for both EdgeSecurityDependencies and NodeSecurityContextDependencies
```

### `SecureActionResult` union

```
ADDED: { status: 'bootstrap_required' }
ADDED: { status: 'onboarding_required' }
ADDED: { status: 'tenant_context_required' }
ADDED: { status: 'tenant_membership_required' }
BREAKING: existing 'unauthorized' no longer returned for tenancy errors (now typed statuses)
```

### `redirectAuthenticatedFromAuthRoute()` in `with-auth.ts`

```
REMOVED param: onboardingComplete
CHANGED: always redirects to /auth/bootstrap (was conditional on onboardingComplete)
ADDED: forwards existing redirect_url query param to bootstrap URL
```

### `CustomJwtSessionClaims.metadata`

```
REMOVED: targetLanguage, proficiencyLevel, learningGoal
ADDED: displayName, locale, timezone
```

### Env vars

```
ADDED:   NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL (default: /auth/bootstrap)
ADDED:   NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL (default: /auth/bootstrap)
CHANGED: NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL (default: /auth/bootstrap, was /)
CHANGED: NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL (default: /auth/bootstrap, was /)
```

### `completeOnboarding()` return shape

```
CHANGED: now returns { message, redirectUrl } on success (was { message })
```

---

## 6. Delivery Phases

### Phase 1 — State Machine + Bootstrap Route + Clerk Redirect Wiring + Auth-Route Recovery + Secure Actions Readiness

Tasks 1.1–1.11:

- `BOOTSTRAP_REQUIRED` in all type contracts
- `/auth/bootstrap` page + error UI
- Safe redirect utility
- Route classification: `isBootstrapRoute`
- `with-auth.ts` bootstrap passthrough + auth-route recovery fix (→ `/auth/bootstrap`)
- `with-node-provisioning.ts` `BOOTSTRAP_REQUIRED` → 409
- `users/layout.tsx` `BOOTSTRAP_REQUIRED` redirect
- Env: add force redirect vars, update fallback defaults
- `layout.tsx` ClerkProvider: add forceRedirectUrl props
- `HeaderAuthControls.tsx`: fix modal redirect props
- `security-context.ts`: add `readinessStatus` field
- `secure-action.ts`: typed readiness responses

### Phase 2 — DB Schema + Onboarding Refactor

Tasks 2.1–2.5:

- DB migration: generic profile columns
- All UserRepository implementations + user contract
- ClerkUserRepository + its tests
- `globals.d.ts` JWT claims update
- Onboarding action: generic fields + redirect_url preservation
- Onboarding page: generic form + hidden redirect_url input
- Onboarding layout: **remove bootstrap path** + completed redirect → `/users`

### Phase 3 — Test Coverage

Tasks 3.1–3.13 + 3.5b/c/d/e:

- Unit: state machine (all 7 states), safe-redirect, `with-node-provisioning`, route classification, `with-auth` bootstrap passthrough, **auth-route recovery**, **secure action readiness**, **security-context readinessStatus**, **onboarding layout bootstrap redirect**, bootstrap error UI
- Integration: bootstrap route all states + redirect preservation, provisioning-status probe, protected layout
- DB integration: idempotency, policy templates
- E2E: full matrix (single/personal/org-provider/org-db), all mandatory positive/negative paths, modal + page redirect invariants, fixture docs

### Phase 4 — Quality Gates

Tasks 4.1–4.5: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm test:db`

---

## 7. Verification Approach

After implementation, all of these must hold:

1. External session + empty DB → `/users` redirects to `/auth/bootstrap?redirect_url=/users`.
2. External session + empty DB → `/api/users` returns 409 `BOOTSTRAP_REQUIRED`.
3. External session + empty DB → `/api/me/provisioning-status` returns 409 `BOOTSTRAP_REQUIRED` (not 200).
4. `/auth/bootstrap` calls `ensureProvisioned()` before any onboarding redirect.
5. Bootstrap → onboarding preserves `redirect_url` query param.
6. Onboarding completion navigates to preserved target (not hardcoded `/users`).
7. `completeOnboarding()` works without being the first provisioning call.
8. All Clerk auth entrypoints (page + modal) force-redirect to `/auth/bootstrap`.
9. Modal sign-in button has `forceRedirectUrl` set to `/auth/bootstrap`.
10. Bootstrap route is not blocked by Edge gate for authenticated users.
11. Bootstrap `redirect_url` external URLs are rejected (no open redirect).
12. Old profile fields (`targetLanguage`, `proficiencyLevel`, `learningGoal`) are absent from all files.
13. Authenticated user visiting `/sign-in` or `/sign-up` directly → redirected to `/auth/bootstrap`.
14. `/sign-in?redirect_url=/dashboard` while authenticated → redirected to `/auth/bootstrap?redirect_url=%2Fdashboard`.
15. Unprovisioned user visiting `/onboarding` directly → redirected to `/auth/bootstrap` (not rendered to form).
16. Secure server action invoked while `BOOTSTRAP_REQUIRED` → returns `{ status: 'bootstrap_required' }`.
17. Secure server action with tenancy errors → returns typed statuses, not generic `unauthorized`.
18. `SecurityContext.readinessStatus` correctly set for all 6 access states.
19. `EdgeSecurityDependencies` does NOT include `userRepository`.
20. `createMockSecurityContext()` default includes `readinessStatus: 'ALLOWED'`.
21. `security-showcase/page.tsx` renders without type errors; both fallback contexts include `readinessStatus: 'UNAUTHENTICATED'`.
22. `pnpm typecheck` and `pnpm lint` pass with zero errors.
