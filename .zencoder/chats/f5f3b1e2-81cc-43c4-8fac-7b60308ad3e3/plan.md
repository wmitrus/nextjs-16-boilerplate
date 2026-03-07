# Auth, Authorization & Provisioning — Implementation Plan

**PRD:** `requirements.md`  
**Spec:** `spec.md`  
**Design:** `docs/feature-desings/01 - Final Auth, Authorization and Provisioning Design.md`

---

## Workflow Steps

### [x] Step: Requirements

PRD written to `requirements.md`. All functional and non-functional requirements captured. Key clarifications obtained from user:

- Both sign-in and sign-up use force redirect to `/auth/bootstrap`
- Bootstrap failure renders inline controlled error UI (no redirect)
- Onboarding fields replaced with generic `displayName`, `locale`, `timezone`
- E2E tests required — fixture docs/scripts needed (Clerk test users not yet configured)
- `BOOTSTRAP_REQUIRED` on protected page → redirect to `/auth/bootstrap`; on API → 409

### [x] Step: Technical Specification

Spec written to `spec.md`. Covers:

- State machine extension (BOOTSTRAP_REQUIRED)
- New /auth/bootstrap route design
- Route classification update (isBootstrapRoute)
- DB schema migration (generic profile fields)
- All modified/new files listed
- 4-phase delivery plan

### [x] Step: Planning

This document.

---

## Implementation Tasks

### Phase 1 — State Machine + Bootstrap Route (Core)

#### [ ] Task 1.1 — Extend type contracts with BOOTSTRAP_REQUIRED

Files to modify:

- `src/core/contracts/provisioning-access.ts` — Add `'BOOTSTRAP_REQUIRED'` to `ProvisioningAccessDenyStatus` and `ProvisioningApiErrorCode`
- `src/security/core/node-provisioning-access.ts` — Add `'BOOTSTRAP_REQUIRED'` to `NodeProvisioningAccessStatus` and `NodeProvisioningDenyCode`; update state machine logic:
  - `UserNotProvisionedError` from `identityProvider.getCurrentIdentity()` → `BOOTSTRAP_REQUIRED` (was `ONBOARDING_REQUIRED`)
  - DB lookup returns null user → `BOOTSTRAP_REQUIRED` (was `ONBOARDING_REQUIRED`)
  - User exists but `onboardingComplete === false` → `ONBOARDING_REQUIRED` (unchanged)

Verification: `pnpm typecheck` passes.

#### [ ] Task 1.2 — Update protected API wrapper

File to modify:

- `src/security/api/with-node-provisioning.ts` — Add `BOOTSTRAP_REQUIRED` branch before `ONBOARDING_REQUIRED` returning 409 with `BOOTSTRAP_REQUIRED` code

Verification: existing tests still pass; new test case added.

#### [ ] Task 1.3 — Create safe redirect utility

New file: `src/shared/lib/routing/safe-redirect.ts`

Functions:

- `isValidInternalRedirect(url: string): boolean` — rejects: empty, starting with `//`, containing `://`, starting with `http`
- `sanitizeRedirectUrl(url: string, fallback: string): string` — returns url if valid, fallback otherwise

Co-located test: `src/shared/lib/routing/safe-redirect.test.ts`

Test cases:

- Valid: `/users`, `/app/dashboard`, `/onboarding`
- Invalid: `https://evil.com`, `//evil.com`, empty string, `javascript:alert(1)`

#### [ ] Task 1.4 — Create /auth/bootstrap route

New files:

- `src/app/auth/bootstrap/page.tsx` — RSC page (Node runtime), orchestrates bootstrap flow:
  1. Read `redirect_url` from `searchParams` (await per Next.js 16)
  2. Sanitize with `sanitizeRedirectUrl(redirectUrl, '/users')` → `safeTarget`
  3. Resolve `AUTH.IDENTITY_SOURCE` from `getAppContainer()`
  4. Call `.get()` — if no `userId` → `redirect('/sign-in')`
  5. Call `PROVISIONING.SERVICE.ensureProvisioned(...)` inside try/catch
  6. On `CrossProviderLinkingNotAllowedError` → render `<BootstrapErrorUI error="cross_provider_linking" />`
  7. On `TenantUserLimitReachedError` → render `<BootstrapErrorUI error="quota_exceeded" />`
  8. On `TenantContextRequiredError` / `TenantNotProvisionedError` → render `<BootstrapErrorUI error="tenant_config" />`
  9. On provisioning success → resolve user via `AUTH.USER_REPOSITORY.findById(internalUserId)`
  10. If `!user.onboardingComplete` → `redirect('/onboarding?redirect_url=' + encodeURIComponent(safeTarget))`
  11. Else → `redirect(safeTarget)`

  Note: redirect target is preserved through onboarding via sanitized query param. Bootstrap owns post-auth routing as required by design §5.1.

- `src/app/auth/bootstrap/bootstrap-error.tsx` — Client component:
  - Props: `error: 'cross_provider_linking' | 'quota_exceeded' | 'tenant_config'`
  - Renders human-readable error message per error type
  - "Try Again" button → `window.location.reload()`
  - "Sign out" button → calls Clerk `useClerk().signOut()` then redirects to `/sign-in`
  - No sensitive internal error details exposed

#### [ ] Task 1.5 — Update route classification

Files to modify:

- `src/security/middleware/route-classification.ts` — Add `isBootstrapRoute: boolean` to `RouteContext` interface; add classification logic: `path === '/auth/bootstrap' || path.startsWith('/auth/bootstrap/')`
- `src/security/middleware/with-auth.ts` — Add bootstrap route passthrough: if `ctx.isBootstrapRoute` and user has external session → pass to handler (skip onboarding redirect, skip unauthenticated reject for missing internal state); if no session on bootstrap route → still redirect to sign-in

Verification: existing `with-auth.test.ts` still passes; add bootstrap route test cases.

#### [ ] Task 1.6 — Update users/layout.tsx redirect mapping

File to modify:

- `src/app/users/layout.tsx` — Add before `ONBOARDING_REQUIRED` check:
  ```
  if (access.status === 'BOOTSTRAP_REQUIRED') {
    redirect('/auth/bootstrap?redirect_url=/users');
  }
  ```

#### [ ] Task 1.7 — Update env.ts Clerk redirect defaults

File to modify:

- `src/core/env.ts`:
  - Add `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` with default `/auth/bootstrap`
  - Add `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` with default `/auth/bootstrap` (was only in `runtimeEnv`, not schema)
  - Change `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` default: `/` → `/auth/bootstrap`
  - Change `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` default: `/` → `/auth/bootstrap`
  - Add both new vars to `runtimeEnv`
- `.env.example` — Add/update corresponding entries

#### [ ] Task 1.8 — Update ClerkProvider to pass forceRedirectUrl props

File to modify:

- `src/app/layout.tsx` — The `ClerkProvider` currently only passes `signInFallbackRedirectUrl` and `signUpFallbackRedirectUrl`. Add `signInForceRedirectUrl` and `signUpForceRedirectUrl` using the T3-Env-validated values. Without explicit prop wiring, the force redirect env vars are not guaranteed to be picked up via the T3-Env schema.

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

#### [ ] Task 1.9 — Fix HeaderAuthControls modal redirect props

File to modify:

- `src/modules/auth/ui/HeaderAuthControls.tsx` — The header modal buttons are an independent Clerk entrypoint and override `ClerkProvider` props. Currently:
  - `SignInButton` has **no** `forceRedirectUrl` prop at all — sign-in through header modal does not land on `/auth/bootstrap`
  - `SignUpButton` has `signInForceRedirectUrl` incorrectly wired to the fallback URL (not the force URL)

Required changes:

- `SignInButton`: add `forceRedirectUrl={env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL}`
- `SignUpButton`: fix `signInForceRedirectUrl` to `env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` (not the fallback URL)

Final correct shape:

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

Note: This is a Clerk-specific component. The fix is scoped to the Clerk adapter boundary. When `AUTH_PROVIDER !== 'clerk'`, this component is not rendered.

#### [ ] Task 1.10 — Fix auth-route recovery to redirect through bootstrap (with redirect_url preservation)

**Problem**: `with-auth.ts` `redirectAuthenticatedFromAuthRoute()` (line 93–108) currently redirects authenticated users who hit `/sign-in` or `/sign-up` directly to either `/` (if onboarding complete) or `/onboarding` (if not). It never sends them through `/auth/bootstrap`. This means a real runtime path exists where:

- External session is active
- Internal provisioning may be missing
- Auth-route visit bypasses bootstrap convergence entirely

Additionally, any existing `redirect_url` query param already present on the auth route (e.g. `/sign-in?redirect_url=/dashboard`) must be forwarded to bootstrap — not dropped.

File to modify:

- `src/security/middleware/with-auth.ts` — Update `redirectAuthenticatedFromAuthRoute()`:
  - Remove the `onboardingComplete` conditional logic entirely
  - Extract `redirect_url` from the auth route's search params (use `req.nextUrl.searchParams.get('redirect_url')`)
  - Sanitize with `sanitizeRedirectUrl()` (or re-sanitize at bootstrap boundary — either is acceptable)
  - Build redirect URL: `new URL('/auth/bootstrap', req.url)` + append `redirect_url` param if present
  - The function signature may drop the `onboardingComplete` parameter — update all call sites

Final behavior:

- No session + auth route → pass through (Clerk renders sign-in/sign-up page)
- Active session + `/sign-in` → redirect to `/auth/bootstrap`
- Active session + `/sign-in?redirect_url=/dashboard` → redirect to `/auth/bootstrap?redirect_url=%2Fdashboard`
- Active session + `/sign-up` → redirect to `/auth/bootstrap`

Tests to add (Task 3.5b):

- Active session + direct `/sign-in` → redirect `/auth/bootstrap` (not `/` or `/onboarding`)
- Active session + `/sign-in?redirect_url=/dashboard` → redirect `/auth/bootstrap?redirect_url=%2Fdashboard`
- Active session + `/sign-up` → redirect `/auth/bootstrap`
- Active session + empty DB + `/sign-in` → redirects to `/auth/bootstrap` (does NOT bounce to `/`)

#### [ ] Task 1.11 — Extend SecurityContext with typed readiness status (with correct Edge/Node dependency split)

**Problem**: The final design requires protected pages, protected APIs, and **secure server actions** to all participate in the same internal-readiness model. Currently:

- `security-context.ts` catches `UserNotProvisionedError` → sets `identity = null` silently
- `secure-action.ts` treats `!context.user` as generic `AuthorizationError` → returns `{ status: 'unauthorized' }`
- The four readiness states (`BOOTSTRAP_REQUIRED`, `ONBOARDING_REQUIRED`, `TENANT_CONTEXT_REQUIRED`, `TENANT_MEMBERSHIP_REQUIRED`) all collapse into generic "unauthorized" in actions

**Critical constraint**: `userRepository` must NOT be added to `SecurityContextDependencies` (the shared base) because `EdgeSecurityDependencies` is an alias of it. Doing so would leak a Node/DB dependency into the Edge contract — directly violating the design rule that Edge must not own DB-backed readiness logic.

Files to modify:

**`src/security/core/security-dependencies.ts`** — Split the dependency hierarchy:

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

export type SecurityContextDependencies = BaseSecurityDependencies; // kept for backward compat during transition
export type SecurityDependencies =
  | EdgeSecurityDependencies
  | NodeSecurityDependencies;
```

**`src/security/core/security-context.ts`**:

- Change `createSecurityContext()` parameter type from `SecurityContextDependencies` to `NodeSecurityContextDependencies`
- Add `readinessStatus` field to `SecurityContext` interface:
  ```typescript
  readinessStatus:
    | 'ALLOWED'
    | 'BOOTSTRAP_REQUIRED'
    | 'ONBOARDING_REQUIRED'
    | 'TENANT_CONTEXT_REQUIRED'
    | 'TENANT_MEMBERSHIP_REQUIRED'
    | 'UNAUTHENTICATED';
  ```
- In `createSecurityContext()`, derive `readinessStatus` with these mappings:
  - `UserNotProvisionedError` caught → `readinessStatus = 'BOOTSTRAP_REQUIRED'`, `identity = null`
  - `!identity` after resolution → `readinessStatus = 'UNAUTHENTICATED'`
  - Identity OK → look up user via `userRepository.findById(identity.id)`:
    - `!user` → `readinessStatus = 'BOOTSTRAP_REQUIRED'` (no internal record)
    - `user.onboardingComplete === false` → `readinessStatus = 'ONBOARDING_REQUIRED'`
    - User OK → proceed to tenant resolution
  - `MissingTenantContextError` / `TenantNotProvisionedError` caught → `readinessStatus = 'TENANT_CONTEXT_REQUIRED'`
  - `TenantMembershipRequiredError` caught → `readinessStatus = 'TENANT_MEMBERSHIP_REQUIRED'`
  - All checks pass → `readinessStatus = 'ALLOWED'`

**`src/security/actions/secure-action.ts`**:

- Replace the generic `!context.user → throw new AuthorizationError(...)` block with readiness-status checks:
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
    return {
      status: 'unauthorized' as const,
      error: 'Authentication required',
    };
  }
  ```
- Add the new status variants to the `SecureActionResult` union type

Tests to add (Task 3.5c):

- Secure action: `BOOTSTRAP_REQUIRED` context → returns `{ status: 'bootstrap_required' }`
- Secure action: `ONBOARDING_REQUIRED` context → returns `{ status: 'onboarding_required' }`
- Secure action: `TENANT_CONTEXT_REQUIRED` context → returns `{ status: 'tenant_context_required' }`
- Secure action: `TENANT_MEMBERSHIP_REQUIRED` context → returns `{ status: 'tenant_membership_required' }`

#### [ ] Task 1.12 — Update all blast-radius consumers of the breaking security-context/action changes

**Problem**: The `createSecurityContext()` signature change (requires `NodeSecurityContextDependencies` with `userRepository`) and the new `SecureActionResult` statuses are a **breaking change** with real consumers already in the codebase. These must be explicitly updated.

Files to modify:

**`src/features/security-showcase/actions/showcase-actions.ts`** — `createSecurityDependencies()` currently constructs `SecurityContextDependencies { identityProvider, tenantResolver }`. Must be updated to:

- Resolve `userRepository` from the container: `requestContainer.resolve<UserRepository>(AUTH.USER_REPOSITORY)`
- Return `NodeSecurityContextDependencies { identityProvider, tenantResolver, userRepository }` for the `getSecurityContext` factory

**`src/features/security-showcase/components/SettingsFormExample.tsx`** — The `else` branch at line 35 assumes `result.error` exists for all non-success/non-validation statuses. The new statuses (`bootstrap_required`, `onboarding_required`, `tenant_context_required`, `tenant_membership_required`) do NOT have an `error` field. Must handle them explicitly:

```typescript
if (result.status === 'success') {
  setStatus(`Success! Result: ${JSON.stringify(result.data)}`);
} else if (result.status === 'validation_error') {
  setError(`Validation failed: ${JSON.stringify(result.errors)}`);
} else if (result.status === 'bootstrap_required') {
  window.location.href = '/auth/bootstrap';
} else if (result.status === 'onboarding_required') {
  window.location.href = '/onboarding';
} else {
  setError(
    'error' in result
      ? (result.error ?? 'Something went wrong')
      : 'Session state requires attention',
  );
}
```

**`src/testing/integration/server-actions.test.ts`** — Three changes required:

1. `getSecurityContextDependencies()` at line 73: add `userRepository` (resolve from container)
2. Tests at lines 238–256 that expect `tenant_context_required` result instead of `unauthorized` for `MissingTenantContextError` / `TenantNotProvisionedError`
3. Tests at lines 278–296 that expect `tenant_membership_required` result instead of `unauthorized` for `TenantMembershipRequiredError`

**`src/security/core/security-context.mock.ts`** — `createMockSecurityContext()` at line 22 does not include `readinessStatus`. Must add default: `readinessStatus: 'ALLOWED'` to the mock factory so all tests using this mock continue to pass without breaking.

**`src/testing/factories/security.ts`** — No structural change needed (re-exports from `security-context.mock.ts`), but verify the export list after `security-context.mock.ts` is updated.

**`src/app/security-showcase/page.tsx`** — This RSC page directly calls `createSecurityContext()` and constructs `SecurityContextDependencies` manually (lines 28–35). It also builds two fallback `context` objects (lines 41–49 and 63–71) without `readinessStatus`. Three changes required:

1. Import `NodeSecurityContextDependencies` instead of `SecurityContextDependencies`
2. Resolve `AUTH.USER_REPOSITORY` from the container and include in deps
3. Add `readinessStatus: 'UNAUTHENTICATED'` to both fallback context objects (guest + error fallback)

```typescript
const securityContextDependencies: NodeSecurityContextDependencies = {
  identityProvider: requestContainer.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  ),
  tenantResolver: requestContainer.resolve<TenantResolver>(
    AUTH.TENANT_RESOLVER,
  ),
  userRepository: requestContainer.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  ),
};

// fallback contexts:
context = {
  readinessStatus: 'UNAUTHENTICATED',
  user: undefined,
  ip: 'unknown',
  // ...rest unchanged
};
```

**`src/features/security-showcase/actions/showcase-actions.test.ts`** — The test at line 15 checks `result.status !== 'error'` and handles `unauthorized`. After the dependency change, `showcase-actions.ts` will now resolve `userRepository` from the container. Verify the test environment has a container with `AUTH.USER_REPOSITORY` registered (it likely does via `getAppContainer()`). No assertion change needed unless the resolved identity changes.

Tests to add / update (Task 3.5c extended):

- `server-actions.test.ts`: Update `MissingTenantContextError` test to expect `tenant_context_required`
- `server-actions.test.ts`: Update `TenantNotProvisionedError` test to expect `tenant_context_required`
- `server-actions.test.ts`: Update `TenantMembershipRequiredError` test to expect `tenant_membership_required`
- `server-actions.test.ts`: Add `UserNotProvisionedError` test → expect `bootstrap_required`
- `server-actions.test.ts`: Add `onboardingComplete: false` user test → expect `onboarding_required`

---

### Phase 2 — DB Schema + Onboarding Refactor

#### [ ] Task 2.1 — DB schema migration (generic profile fields)

Files to modify:

- `src/modules/user/infrastructure/drizzle/schema.ts` — Replace `targetLanguage`, `proficiencyLevel`, `learningGoal` with `displayName`, `locale`, `timezone`
- Generate migration: `pnpm db:generate` (creates migration file in `src/core/db/migrations/generated/`)

#### [ ] Task 2.2 — Update User contract and all UserRepository implementations

Files to modify:

- `src/core/contracts/user.ts` — Replace domain fields with `displayName?: string; locale?: string; timezone?: string;`; update `updateProfile()` signature
- `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` — Update `findById()` select, `updateProfile()` method
- `src/modules/auth/infrastructure/ClerkUserRepository.ts` — Update `findById()` to return `displayName`, `locale`, `timezone` from `publicMetadata`; update `updateProfile()` signature and implementation to use new generic fields
- `src/modules/auth/infrastructure/ClerkUserRepository.test.ts` — Update test fixtures and assertions: replace `targetLanguage`/`proficiencyLevel` references with `displayName`/`locale`/`timezone`
- `src/types/globals.d.ts` — Update `CustomJwtSessionClaims.metadata` declaration: remove `targetLanguage`, `proficiencyLevel`, `learningGoal`; add `displayName`, `locale`, `timezone`

Note: `ClerkUserRepository` stores profile fields in Clerk `publicMetadata` as a cache — NOT for auth correctness. DB remains the source of truth. This Clerk metadata is a convenience for Clerk-specific UI display only.

#### [ ] Task 2.3 — Update onboarding server action

File to modify:

- `src/modules/auth/ui/onboarding-actions.ts` — Update `completeOnboarding()`:
  - Read `displayName`, `locale`, `timezone`, `redirect_url` from `formData`
  - `displayName` is required; validate and return error if missing
  - `locale`, `timezone`, `redirect_url` are optional
  - Sanitize `redirect_url` with `sanitizeRedirectUrl(rawRedirect, '/users')` before returning
  - Call `userRepository.updateProfile(identity.id, { displayName, locale, timezone })`
  - Return `{ message: 'Onboarding completed', redirectUrl: safeRedirectUrl }` on success

#### [ ] Task 2.4 — Update onboarding page UI

File to modify:

- `src/app/onboarding/page.tsx` — Replace LingoLearn form with generic profile form:
  - Read `redirect_url` from `searchParams` (await per Next.js 16); sanitize it
  - `displayName`: text input, required
  - `locale`: optional select (common locales: `en-US`, `en-GB`, `de-DE`, `fr-FR`, `es-ES`, `pl-PL`, `ja-JP`, `zh-CN`)
  - `timezone`: optional select (common timezones: UTC, America/New_York, America/Chicago, America/Los_Angeles, Europe/London, Europe/Paris, Europe/Warsaw, Asia/Tokyo, Asia/Shanghai)
  - Add `<input type="hidden" name="redirect_url" value={safeRedirectUrl} />` to carry target through form
  - After success: `router.push(res.redirectUrl ?? '/users')` — uses preserved target, not hardcoded path
  - Remove `useUser` / `user.reload()` (no longer needed for Clerk metadata sync)

#### [ ] Task 2.5 — Update onboarding layout to remove bootstrap path

Files to modify:

- `src/app/onboarding/layout.tsx` — Three changes required:
  1. **Remove the `UserNotProvisionedError` bootstrap path** (lines 32–39): the existing catch block renders the onboarding form for unprovisioned users. Replace this with `redirect('/auth/bootstrap')`. This closes the architectural gap where `/onboarding` remains a reachable provisioning entrypoint for unprovisioned sessions.
  2. **Change `redirect('/')` → `redirect('/users')`** when `onboardingComplete === true`.
  3. **Remove all legacy comments** referencing onboarding as the provisioning entrypoint (e.g., "PR-3 will call ensureProvisioned() inside completeOnboarding()").

Note: App Router layouts do NOT receive `searchParams` — only page components do. The `redirect_url` is read by `page.tsx` directly from its own `searchParams`. No searchParams passing is required in the layout.

Final layout behavior:

- No external session → `redirect('/sign-in')`
- `UserNotProvisionedError` (unprovisioned) → `redirect('/auth/bootstrap')` ← key change
- Identity OK, `onboardingComplete === true` → `redirect('/users')` ← was `/`
- Identity OK, `onboardingComplete === false` → render children (standard path)

---

### Phase 3 — Test Coverage

#### [ ] Task 3.1 — Unit tests: state machine

File to create/modify:

- `src/security/core/node-provisioning-access.test.ts` — Add test cases:
  - `UserNotProvisionedError` → status is `BOOTSTRAP_REQUIRED` (not `ONBOARDING_REQUIRED`)
  - Null user after identity resolution → status is `BOOTSTRAP_REQUIRED`
  - User exists + `onboardingComplete=false` → status is `ONBOARDING_REQUIRED`
  - All 7 states covered with distinct test cases

#### [ ] Task 3.2 — Unit tests: safe-redirect utility

File: `src/shared/lib/routing/safe-redirect.test.ts` (created in Task 1.3)

#### [ ] Task 3.3 — Unit tests: with-node-provisioning BOOTSTRAP_REQUIRED

File to modify:

- `src/security/api/with-node-provisioning.test.ts` — Add test: `BOOTSTRAP_REQUIRED` outcome → 409 with `{ code: 'BOOTSTRAP_REQUIRED' }`

#### [ ] Task 3.4 — Unit tests: route classification

File to modify:

- `src/security/middleware/route-classification.test.ts` — Add test: `/auth/bootstrap` → `isBootstrapRoute: true`, `isAuthRoute: false`, `isPublicRoute: false`

#### [ ] Task 3.5 — Unit tests: with-auth bootstrap passthrough

File to modify:

- `src/security/middleware/with-auth.test.ts` — Add test cases:
  - Bootstrap route with valid session but no internal user → passes through (no redirect to sign-in)
  - Bootstrap route with no session → redirects to sign-in

#### [ ] Task 3.5b — Unit tests: auth-route recovery redirects through bootstrap

File to modify:

- `src/security/middleware/with-auth.test.ts` — Add test cases for `redirectAuthenticatedFromAuthRoute()`:
  - Active session + `/sign-in` → redirect to `/auth/bootstrap` (not `/` or `/onboarding`)
  - Active session + `/sign-up` → redirect to `/auth/bootstrap`
  - No session + `/sign-in` → returns `null` (pass through to Clerk page)
  - Active session + non-auth route → returns `null` (this function is no-op for non-auth routes)

#### [ ] Task 3.5c — Unit tests: secure action typed readiness responses

File to modify:

- `src/security/actions/secure-action.test.ts` — Add test cases for each readiness state:
  - Mock `getSecurityContext()` returning `readinessStatus: 'BOOTSTRAP_REQUIRED'` → action returns `{ status: 'bootstrap_required' }`
  - Mock `readinessStatus: 'ONBOARDING_REQUIRED'` → action returns `{ status: 'onboarding_required' }`
  - Mock `readinessStatus: 'TENANT_CONTEXT_REQUIRED'` → action returns `{ status: 'tenant_context_required' }`
  - Mock `readinessStatus: 'TENANT_MEMBERSHIP_REQUIRED'` → action returns `{ status: 'tenant_membership_required' }`
  - Mock `readinessStatus: 'UNAUTHENTICATED'` → action returns `{ status: 'unauthorized', error: 'Authentication required' }`
  - Verify no handler execution occurs for any readiness-denied state

#### [ ] Task 3.5d — Unit tests: security-context readinessStatus mapping

File to modify:

- `src/security/core/security-context.test.ts` — Add test cases:
  - `UserNotProvisionedError` from identityProvider → `readinessStatus: 'BOOTSTRAP_REQUIRED'`, `user: undefined`
  - No identity (unauthenticated) → `readinessStatus: 'UNAUTHENTICATED'`
  - Identity OK + `onboardingComplete: false` → `readinessStatus: 'ONBOARDING_REQUIRED'`
  - `MissingTenantContextError` → `readinessStatus: 'TENANT_CONTEXT_REQUIRED'`
  - `TenantMembershipRequiredError` → `readinessStatus: 'TENANT_MEMBERSHIP_REQUIRED'`
  - Full valid context → `readinessStatus: 'ALLOWED'`, `user` populated

#### [ ] Task 3.5e — Unit tests: onboarding layout UserNotProvisionedError → bootstrap redirect

File to modify:

- `src/app/onboarding/layout.test.tsx` (create if not exists) — Add test cases:
  - `UserNotProvisionedError` thrown by identityProvider → layout redirects to `/auth/bootstrap`
  - Authenticated + `onboardingComplete: true` → layout redirects to `/users`
  - Authenticated + `onboardingComplete: false` → renders children

#### [ ] Task 3.6 — Unit tests: bootstrap error UI mapping

File: `src/app/auth/bootstrap/bootstrap-error.test.tsx`

Test: each error type renders correct message; no internal error details visible.

#### [ ] Task 3.7 — Integration tests: bootstrap route

File: `src/app/auth/bootstrap/page.test.tsx`

Integration test cases (using Vitest + mock container):

- No external session → redirects to `/sign-in`
- New user (no internal record) → calls `ensureProvisioned()` → user has `onboardingComplete=false` → redirects to `/onboarding?redirect_url=/users`
- New user with specific `redirect_url=/app/dashboard` → redirects to `/onboarding?redirect_url=%2Fapp%2Fdashboard` (target preserved)
- Provisioned user with `onboardingComplete=true` → redirects to `safeTarget` (or `/users` default)
- Provisioned user with `onboardingComplete=true` + valid `redirect_url` → redirects to that target
- `CrossProviderLinkingNotAllowedError` → renders bootstrap error UI with `cross_provider_linking` error
- `TenantUserLimitReachedError` → renders bootstrap error UI with `quota_exceeded` error
- External URL in `redirect_url` → sanitized to `/users` (no open redirect)

#### [ ] Task 3.7b — Integration tests: /api/me/provisioning-status with BOOTSTRAP_REQUIRED

File to modify:

- `src/app/api/me/provisioning-status/route.ts` — Verify the endpoint is wrapped by `withNodeProvisioning`; since `withNodeProvisioning` now returns 409 `BOOTSTRAP_REQUIRED` for bootstrap-required state, the probe endpoint automatically surfaces this state. Add explicit integration test case.
- Test file (integration): verify `BOOTSTRAP_REQUIRED` → probe returns 409 with `{ code: 'BOOTSTRAP_REQUIRED' }` (not 200 with `authenticated: true`).

#### [ ] Task 3.8 — Integration tests: protected layout

File to modify:

- `src/app/users/layout.test.tsx` — Add test: `BOOTSTRAP_REQUIRED` access outcome → redirects to `/auth/bootstrap?redirect_url=/users`

#### [ ] Task 3.9 — DB integration tests: bootstrap idempotency

File to modify/create:

- `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts` — Verify (these may already exist, confirm coverage):
  - First bootstrap creates user, tenant, membership records
  - Idempotent re-bootstrap does not duplicate records
  - No role escalation on repeated `ensureProvisioned()`

#### [ ] Task 3.10 — E2E: extend clerk-auth.ts with all test user helpers

File to modify:

- `e2e/clerk-auth.ts` — Add helper functions per spec section 2.9

#### [ ] Task 3.11 — E2E: extend check-e2e-auth-env.mjs

File to modify:

- `scripts/check-e2e-auth-env.mjs` — Validate all new E2E env vars

#### [ ] Task 3.12 — E2E fixture documentation

New file: `scripts/e2e-clerk-fixtures.md`

Documents how to create in Clerk Dashboard:

- All required test user accounts (single, personal, org owner, org member, org non-member, unverified)
- Required test organizations (e2e-org-owner, e2e-org-member, e2e-org-empty)
- Required env var mapping for each identity

#### [ ] Task 3.13 — E2E specs: bootstrap flow (mandatory full matrix)

Files to create/modify:

**`e2e/provisioning-runtime.spec.ts`** — Positive paths (all mandatory):

- `single` mode: first login → bootstrap → onboarding (redirect_url preserved) → app
- `single` mode: returning login → bootstrap → app (onboarding skipped)
- `personal` mode: first login → bootstrap → onboarding → app (personal tenant created)
- `personal` mode: returning login → app
- `org/provider` mode: first login with active org → bootstrap → onboarding → app
- `org/db` mode: first login → bootstrap → onboarding → app (tenant cookie set)
- Protected API returns 200 after full readiness for all modes
- OAuth entry from sign-in page creating a brand-new user → lands on `/auth/bootstrap`
- OAuth entry from sign-up page → lands on `/auth/bootstrap`

**`e2e/provisioning-runtime.spec.ts`** — Negative paths (all mandatory):

- Active Clerk session + DB reset → `/users` returns `BOOTSTRAP_REQUIRED` redirect
- Active Clerk session + DB reset → `/api/me/provisioning-status` returns 409 `BOOTSTRAP_REQUIRED`
- Missing default tenant (`single` mode) → bootstrap renders controlled error UI (not bounce to sign-in)
- `org/provider` without active org → bootstrap renders `tenant_config` error UI
- `org/db` without active tenant cookie/header → bootstrap renders `tenant_config` error UI
- `org/db` with active tenant but no membership → `/api/users` returns 403
- Cross-provider email linking blocked → bootstrap renders `cross_provider_linking` error UI
- Free-tier user limit reached → bootstrap renders `quota_exceeded` error UI
- Bootstrap error UI: no internal error details visible in page source

**`e2e/auth.spec.ts`** — Clerk redirect invariants (mandatory):

- Sign-in via `/sign-in` page force redirects to `/auth/bootstrap`
- Sign-up via `/sign-up` page force redirects to `/auth/bootstrap`
- Sign-in via header modal force redirects to `/auth/bootstrap`
- Sign-up via header modal force redirects to `/auth/bootstrap`
- Switching sign-in → sign-up within Clerk UI (modal or page) still ends at `/auth/bootstrap`
- Switching sign-up → sign-in within Clerk UI (modal or page) still ends at `/auth/bootstrap`

---

### Phase 4 — Quality Gates

#### [ ] Task 4.1 — Run pnpm typecheck

Command: `pnpm typecheck`
Expected: zero errors.

#### [ ] Task 4.2 — Run pnpm lint

Command: `pnpm lint`
Expected: zero errors/warnings.

#### [ ] Task 4.3 — Run pnpm test (unit)

Command: `pnpm test`
Expected: all unit tests pass.

#### [ ] Task 4.4 — Run pnpm test:integration

Command: `pnpm test:integration`
Expected: all integration tests pass.

#### [ ] Task 4.5 — Run pnpm test:db

Command: `pnpm test:db`
Expected: all DB integration tests pass.

---

## Invariants — Final Validation Checklist

Before marking this feature complete, verify every item:

- [ ] Active Clerk session + empty DB → `/users` redirects to `/auth/bootstrap?redirect_url=/users`
- [ ] Active Clerk session + empty DB → `/api/users` returns 409 `BOOTSTRAP_REQUIRED`
- [ ] Active Clerk session + empty DB → `/api/me/provisioning-status` returns 409 `BOOTSTRAP_REQUIRED` (not 200)
- [ ] `/auth/bootstrap` calls `ensureProvisioned()` (check logs: `provisioning:ensure succeeded`)
- [ ] New user cannot reach `/users` or `/api/users` without going through `/auth/bootstrap` first
- [ ] Bootstrap → onboarding: `redirect_url` query param is preserved in `/onboarding?redirect_url=...`
- [ ] Onboarding completion navigates to the preserved `redirect_url`, not hardcoded `/users`
- [ ] `BOOTSTRAP_REQUIRED` and `ONBOARDING_REQUIRED` are different response codes in `/api/me/provisioning-status`
- [ ] Bootstrap route is not blocked by Edge session gate when user has valid Clerk session
- [ ] Bootstrap route with external `redirect_url` does not redirect to external domain
- [ ] `completeOnboarding()` works WITHOUT being the first provisioning call
- [ ] Onboarding form uses `displayName`, `locale`, `timezone` (not language-learning fields)
- [ ] `ClerkUserRepository` uses `displayName`, `locale`, `timezone` fields (old fields gone from all files)
- [ ] `globals.d.ts` `CustomJwtSessionClaims` no longer references `targetLanguage`/`proficiencyLevel`/`learningGoal`
- [ ] Sign-in and sign-up force-redirect to `/auth/bootstrap` via page (`/sign-in`, `/sign-up`) AND header modal
- [ ] Header modal sign-in button has `forceRedirectUrl` pointing to `/auth/bootstrap`
- [ ] Header modal sign-up → sign-in cross-link uses `signInForceRedirectUrl` pointing to `/auth/bootstrap`
- [ ] Authenticated user visiting `/sign-in` or `/sign-up` directly → redirects to `/auth/bootstrap` (not `/` or `/onboarding`)
- [ ] `/sign-in?redirect_url=/dashboard` while authenticated → redirects to `/auth/bootstrap?redirect_url=%2Fdashboard` (target forwarded)
- [ ] Unprovisioned user visiting `/onboarding` directly → redirects to `/auth/bootstrap` (not rendered to form)
- [ ] Secure server action with `BOOTSTRAP_REQUIRED` context → returns `{ status: 'bootstrap_required' }` (not generic `unauthorized`)
- [ ] Secure server action with `ONBOARDING_REQUIRED` context → returns `{ status: 'onboarding_required' }`
- [ ] Secure server action with `TENANT_CONTEXT_REQUIRED` → returns `{ status: 'tenant_context_required' }` (not generic `unauthorized`)
- [ ] Secure server action with `TENANT_MEMBERSHIP_REQUIRED` → returns `{ status: 'tenant_membership_required' }` (not generic `unauthorized`)
- [ ] `SecurityContext` includes `readinessStatus` field with correct value for all 6 access states
- [ ] `EdgeSecurityDependencies` does NOT include `userRepository` — it remains a narrow base type
- [ ] `NodeSecurityContextDependencies` used for `createSecurityContext()` — includes `userRepository`
- [ ] `createMockSecurityContext()` default includes `readinessStatus: 'ALLOWED'`
- [ ] `server-actions.test.ts` expectations updated to typed readiness statuses (not `unauthorized`) for tenancy errors
- [ ] `security-showcase/page.tsx` uses `NodeSecurityContextDependencies` with `userRepository` and includes `readinessStatus: 'UNAUTHENTICATED'` in all fallback context objects
- [ ] Full E2E matrix passes: `single`, `personal`, `org/provider`, `org/db`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm test:db` all pass

---

## Notes & Decisions

- **`with-auth.ts` Edge middleware**: Does NOT check `BOOTSTRAP_REQUIRED` (Edge cannot do DB). The bootstrap route passthrough is handled by `isBootstrapRoute` check — authenticated users pass through; unauthenticated users are still rejected by Edge (they need to sign in first to reach bootstrap).
- **Clerk `forceRedirectUrl` wiring**: `env.ts` schema change alone is not sufficient. The `ClerkProvider` in `layout.tsx` explicitly passes fallback redirect props — it must also pass `signInForceRedirectUrl` and `signUpForceRedirectUrl`. Without this, T3-Env-validated values are not guaranteed to reach the Clerk provider.
- **Redirect target preservation**: Implemented via sanitized query param (`/onboarding?redirect_url=...`), not a cookie. This is transparent and re-validated at every boundary. No server-side state required.
- **Onboarding layout**: When `onboardingComplete === true`, redirect to `/users` (not `/`). This enforces that onboarded users go to the protected app.
- **Bootstrap error on page**: The `BootstrapErrorUI` is a client component for sign-out interactivity. The page itself is a server component.
- **DB migration safety**: The column rename (drop + add) means existing development data will lose profile fields. This is acceptable for boilerplate development. Production would need a data migration too.
- **`ClerkUserRepository` profile fields**: These are a convenience metadata cache in Clerk `publicMetadata`, not a correctness dependency. DB is authoritative. The old `targetLanguage`/`proficiencyLevel`/`learningGoal` fields must be removed from ClerkUserRepository, its tests, and `globals.d.ts`.
- **`/api/me/provisioning-status`**: No code change needed — it is already wrapped by `withNodeProvisioning`. Once `withNodeProvisioning` returns 409 for `BOOTSTRAP_REQUIRED`, the probe automatically surfaces it. Only a test case needs to be added.
- **Auth-route recovery (Task 1.10)**: `redirectAuthenticatedFromAuthRoute()` no longer branches on `onboardingComplete`. Any authenticated user on an auth route goes through `/auth/bootstrap`. Existing `redirect_url` param is forwarded: `/sign-in?redirect_url=/dashboard` → `/auth/bootstrap?redirect_url=%2Fdashboard`. Bootstrap then determines onboarding state.
- **SecurityContext dependency split (Task 1.11)**: `userRepository` must NOT be added to `SecurityContextDependencies`/`EdgeSecurityDependencies` (Edge base). Instead, a new `NodeSecurityContextDependencies` interface extends the base with `userRepository`. `createSecurityContext()` accepts `NodeSecurityContextDependencies`. Edge code never calls `createSecurityContext()` — it only constructs the narrow base dependencies.
- **Secure action result types (Task 1.12)**: The `SecureActionResult` union gains 4 new discriminated members. Real consumers already in codebase: `SettingsFormExample.tsx`, `server-actions.test.ts`, `showcase-actions.ts`, `security-context.mock.ts`. All must be updated as part of Task 1.12 before Phase 1 is considered complete.
- **server-actions.test.ts breaking expectations**: Tests for `MissingTenantContextError`, `TenantNotProvisionedError`, and `TenantMembershipRequiredError` currently expect `status: 'unauthorized'`. After the change they will expect `tenant_context_required` or `tenant_membership_required`. These are correct behavioral changes — update expectations, do not loosen them.
- **E2E matrix**: Full mandatory matrix (single, personal, org/provider, org/db) plus Clerk redirect invariants and all negative paths are required per design §12.4. E2E fixture docs are required deliverable.
- **Bootstrap error UI sign-out (P2 — provider orthogonality)**: `BootstrapErrorUI` uses Clerk's `useClerk().signOut()` directly. This is intentionally Clerk-scoped: bootstrap error state means external auth succeeded but internal bootstrap failed; the only meaningful action is to sign out of the external session. Since this component is only rendered when `AUTH_PROVIDER=clerk`, this is acceptable. When authjs/supabase become runtime-complete, this component must be replaced with a provider-agnostic sign-out abstraction. This is documented as a known debt, not a blocker.
- **`HeaderAuthControls.tsx` scope**: This component is Clerk-only (it unconditionally imports from `@clerk/nextjs`). Any changes to redirect props are Clerk adapter boundary changes and do not violate provider orthogonality.
