# Sign-Up → Bootstrap → Onboarding → Users: Complete Flow Trace Matrix

**Scope**: `TENANCY_MODE=single`, Clerk auth provider, PGLite DB  
**Agent**: Debug / Investigation Agent  
**Status**: Investigation complete — all paths code-verified

---

## 1. System Context

### Identity Representation: Two Contexts

| Context                            | Provider                                                               | `identity.id` value                    | DB lookup                        |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| Edge (middleware)                  | `RequestScopedIdentityProvider` (no `lookup`)                          | Clerk external userId (`user_2abc...`) | None                             |
| Node (server components / actions) | `RequestScopedIdentityProvider` (with `DrizzleInternalIdentityLookup`) | Internal DB UUID                       | Yes — maps Clerk ID → `users.id` |

**Critical**: Edge and Node `identity.id` represent different things. Any DB lookup (provisioning, authorization, user lookup) uses the Node context with internal UUID.

### Env Divergence (Confirmed)

| Variable                                       | `.env.example` (intended) | `.env.local` (actual) |
| ---------------------------------------------- | ------------------------- | --------------------- |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | `/auth/bootstrap`         | `/onboarding`         |

This causes `.env.local` to route new sign-ups directly to `/onboarding` instead of `/auth/bootstrap`. Both paths eventually reach onboarding but via different hop counts. See Path B below.

---

## 2. Middleware Route Classification Summary

Confirmed in `src/security/middleware/route-classification.ts` and `route-policy.ts`:

| Route                  | `isPublicRoute`          | `isAuthRoute` | `isBootstrapRoute` | `isOnboardingRoute` | `isApi` |
| ---------------------- | ------------------------ | ------------- | ------------------ | ------------------- | ------- |
| `/sign-up`, `/sign-in` | ✅ (auth implies public) | ✅            | ❌                 | ❌                  | ❌      |
| `/auth/bootstrap`      | ❌                       | ❌            | ✅                 | ❌                  | ❌      |
| `/onboarding`          | ❌                       | ❌            | ❌                 | ✅                  | ❌      |
| `/users`               | ❌                       | ❌            | ❌                 | ❌                  | ❌      |
| `/api/*`               | ❌                       | ❌            | ❌                 | ❌                  | ✅      |
| `/`                    | ✅                       | ❌            | ❌                 | ❌                  | ❌      |

### Middleware Enforcement per Route (Edge Mode)

| Route                  | Identity resolved                                                    | DB lookup | `onboardingComplete` | Redirect risk                                        |
| ---------------------- | -------------------------------------------------------------------- | --------- | -------------------- | ---------------------------------------------------- |
| `/sign-up`, `/sign-in` | ✅ (Clerk userId, no DB)                                             | None      | `true` (edge)        | Logged-in user → redirected to `/users`              |
| `/auth/bootstrap`      | **BYPASSED** (isBootstrapRoute guard fires before `resolveIdentity`) | None      | N/A                  | None — always passes through                         |
| `/onboarding`          | ✅ (Clerk userId, no DB)                                             | None      | `true` (edge always) | None — `isOnboardingRoute` skips onboarding redirect |
| `/users`               | ✅ (Clerk userId, no DB)                                             | None      | `true` (edge always) | Unauthenticated → 401/redirect                       |

**Key finding**: Middleware never checks `onboardingComplete` in DB for any route. Edge-mode `onboardingComplete` is always `true`. DB-backed onboarding state is enforced only by Node server components (`OnboardingGuard`, `UsersLayout`).

---

## 3. Path A — Happy Path (Intended Flow, `.env.example` config)

**Condition**: `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap`, fresh DB, new Clerk user

```
[1] User clicks Sign Up button on landing page
    → Clerk modal opens (client component)

[2] Clerk completes sign-up → redirects to /auth/bootstrap
    (FORCE_REDIRECT_URL configured)

[3] Edge middleware: /auth/bootstrap
    → isBootstrapRoute = true
    → resolveIdentity() BYPASSED (guard fires first)
    → passes through to page

[4] BootstrapPage (Node RSC) — src/app/auth/bootstrap/page.tsx
    ├─ identity = identityProvider.getCurrentIdentity()
    │   → Edge context: identity.id = Clerk external userId
    ├─ org+provider guard (TENANCY_MODE=single: skipped)
    ├─ input = buildProvisioningInput(identity, env)
    │   → { userId: identity.id, email, tenantId: DEFAULT_TENANT_ID, ... }
    ├─ provisioningService.ensureProvisioned(input)
    │   → creates users row (onboardingComplete=false)
    │   → creates tenants row (DEFAULT_TENANT_ID)
    │   → userCreatedNow = true
    ├─ user = userRepository.findById(identity.id)
    │   → Node DB lookup → found (just created)
    ├─ user.onboardingComplete = false
    └─ redirect('/onboarding?redirect_url=%2Fusers')

[5] Edge middleware: /onboarding
    → isOnboardingRoute = true
    → resolveIdentity() → Clerk userId (no DB)
    → onboardingComplete = true (edge mode always)
    → isOnboardingRoute flag skips onboarding-redirect check
    → passes through

[6] OnboardingGuard (Node RSC) — src/app/onboarding/layout.tsx
    ├─ identity = identityProvider.getCurrentIdentity()
    │   → Node context: DB lookup → internal UUID
    ├─ try { ... } catch (UserNotProvisionedError) → redirect('/auth/bootstrap')
    ├─ user = userRepository.findById(identity.id)
    ├─ user found, onboardingComplete = false
    └─ renders <OnboardingPage> with redirect_url=/users

[7] OnboardingPage renders form
    → User fills displayName, submits

[8] completeOnboarding server action — src/app/onboarding/actions.ts
    ├─ identity = getCurrentIdentity() [Node context, internal UUID]
    ├─ input = buildProvisioningInput(identity, env)
    ├─ provisioningService.ensureProvisioned(input)  ← idempotent, no-op
    ├─ displayName validated (non-empty, max 255 chars)
    ├─ userRepository.updateProfile({ displayName })
    ├─ userRepository.updateOnboardingStatus({ onboardingComplete: true })
    └─ returns { message: 'Onboarding completed', redirectUrl: '/users' }

[9] Client: router.push('/users')

[10] Edge middleware: /users
     → resolveIdentity() → Clerk userId (no DB)
     → onboardingComplete = true (edge always)
     → rejectUnauthenticated → authenticated → passes through

[11] UsersLayout (Node RSC) — src/app/users/layout.tsx
     ├─ resolveNodeProvisioningAccess(getAppContainer())
     │   → src/security/core/node-provisioning-runtime.ts
     ├─ identity = getCurrentIdentity() [Node, DB lookup → internal UUID]
     ├─ user = userRepository.findById(identity.id) → found
     ├─ user.onboardingComplete = true → OK
     ├─ tenant = SingleTenantResolver.resolve(identity)
     │   → { tenantId: DEFAULT_TENANT_ID, userId: identity.id }
     │   → synchronous, no DB call
     ├─ tenantExistsProbe(DEFAULT_TENANT_ID)
     │   → SQL: SELECT id FROM tenants WHERE id = DEFAULT_TENANT_ID
     │   → found → returns true
     ├─ evaluateNodeProvisioningAccess → status: ALLOWED
     └─ renders /users page

OUTCOME: SUCCESS
```

---

## 4. Path B — `.env.local` Divergence Path (Extra Hop)

**Condition**: `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/onboarding`, fresh DB, new Clerk user

```
[1-2] Same as Path A

[3'] Clerk redirects to /onboarding (NOT /auth/bootstrap)

[4'] Edge middleware: /onboarding
     → passes through (same as step [5] in Path A)

[5'] OnboardingGuard (Node RSC)
     ├─ identity = identityProvider.getCurrentIdentity()
     │   → Node context DB lookup → user NOT in DB → UserNotProvisionedError
     ├─ catch (UserNotProvisionedError)
     └─ redirect('/auth/bootstrap')   ← NO redirect_url param!

[6'] Edge middleware: /auth/bootstrap → passes through

[7'] BootstrapPage
     ├─ searchParams.redirect_url = undefined
     ├─ safeTarget = sanitizeRedirectUrl('', '/users') = '/users'
     ├─ provisioning → new user created
     ├─ user.onboardingComplete = false
     └─ redirect('/onboarding?redirect_url=%2Fusers')
         (safeTarget=/users used as default)

[8'-11'] Identical to Path A steps [5]-[11]

OUTCOME: SUCCESS (but 1 extra hop: /onboarding → /auth/bootstrap → /onboarding)
RISK: Extra redirect introduces an extra network round-trip and an additional
      UserNotProvisionedError thrown for every new sign-up in this config.
```

**ENV FIX RECOMMENDED**: Set `.env.local` `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap` to match `.env.example`.

---

## 5. Path C — Returning User (Already Onboarded)

**Condition**: Existing user, `onboardingComplete=true` in DB, signs in

```
[1] User clicks Sign In → Clerk modal → sign-in complete

[2] Clerk redirects (SIGN_IN_FORCE_REDIRECT_URL or default)
    → typically /users or /

[3] Edge middleware: /users
    → Clerk userId present
    → onboardingComplete = true (edge always)
    → passes through

[4] UsersLayout
    → identity (Node, DB lookup) → found
    → onboarding = true
    → tenantExistsProbe → found
    → ALLOWED → renders page

OUTCOME: SUCCESS — no bootstrap, no onboarding
```

---

## 6. Path D — Tenant Lost (DB Reset After Sign-Up)

**Condition**: User exists in DB (`onboardingComplete=true`), but `tenants` table was cleared (e.g., PGLite dev reset)

```
[1] User navigates to /users (authenticated)

[2] Edge middleware: /users → passes through (Clerk userId present)

[3] UsersLayout
    ├─ identity (Node, DB lookup) → found (user still in DB)
    ├─ onboarding = true → OK
    ├─ SingleTenantResolver → { tenantId: DEFAULT_TENANT_ID }
    ├─ tenantExistsProbe(DEFAULT_TENANT_ID)
    │   → SQL: SELECT id FROM tenants WHERE id = DEFAULT_TENANT_ID
    │   → NOT FOUND → returns false
    ├─ evaluateNodeProvisioningAccess → TENANT_CONTEXT_REQUIRED
    │   → code: DEFAULT_TENANT_NOT_FOUND
    └─ redirect('/auth/bootstrap?reason=tenant-lost')

[4] BootstrapPage
    ├─ provisioning → tenant already exists? No → creates tenant
    ├─ user already exists (onboardingComplete=true)
    ├─ user.onboardingComplete = true
    └─ redirect(safeTarget='/users')   ← uses default (no redirect_url in query)

[5] UsersLayout (second attempt)
    → tenantExistsProbe → found → ALLOWED → renders page

OUTCOME: SUCCESS — tenant transparently recovered
NOTE: If PGLite DB is fully wiped (both users + tenants), user hits bootstrap,
      which creates both. Then tries to go to /users but user exists with
      onboarding=false → redirects to /onboarding. Full re-onboarding required.
```

---

## 7. Path E — Bootstrap DB Error (PGLite ENOENT — Sentry Fix)

**Condition**: `./data/` directory missing or inaccessible

```
[1] BootstrapPage renders

[2] provisioningService.ensureProvisioned(input)
    → PGLite constructor throws: ENOENT (no such file or directory: ./data/)
    → NOT a PGliteWasmAbortError / RuntimeError

[3] Error caught by try/catch in BootstrapPage
    ├─ OLD behavior: fell through to `throw err` → RSC stream failure
    │   → client receives TypeError: network error
    │   → ErrorBoundaryHandler renders generic error
    ├─ NEW behavior (post Sentry fix):
    │   → (err as NodeJS.ErrnoException).code === 'ENOENT' → true
    │   → return <BootstrapErrorUI error="db_error" />
    │   → user sees: "Run pnpm db:reset:pglite"

OUTCOME: Handled gracefully — actionable user message shown
```

---

## 8. Path F — Unauthenticated User Accessing Private Route

**Condition**: User not signed in, navigates to `/users`

```
[1] Edge middleware: /users
    → Clerk auth → no userId
    → resolveIdentity() → returns null
    → rejectUnauthenticatedPrivateRoute()
    → not public, not auth, not bootstrap, not onboarding
    → redirects to /sign-in (Clerk default)

OUTCOME: Redirect to sign-in — no server component reached
```

---

## 9. Path G — Signed-In User Accessing Auth Route

**Condition**: Already authenticated user navigates to `/sign-up`

```
[1] Edge middleware: /sign-up
    → isAuthRoute = true, isPublicRoute = true
    → resolveIdentity() → Clerk userId present
    → redirectAuthenticatedAwayFromAuthRoutes()
    → redirect to /users

OUTCOME: Auth route bypassed for logged-in users
```

---

## 10. Decision Points Summary

| Decision Point                       | Location                          | Condition                      | Outcome                                                      |
| ------------------------------------ | --------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| Sign-up redirect target              | Clerk (env)                       | `SIGN_UP_FORCE_REDIRECT_URL`   | `/auth/bootstrap` (intended) or `/onboarding` (`.env.local`) |
| Bootstrap bypasses identity lookup   | Middleware `with-auth.ts:251`     | `isBootstrapRoute=true`        | `resolveIdentity()` skipped entirely                         |
| Bootstrap org guard                  | `bootstrap/page.tsx`              | `tenancyMode !== 'org'`        | Skipped for `single` mode                                    |
| Bootstrap provisioning               | `bootstrap/page.tsx`              | Always                         | Creates user + tenant; idempotent                            |
| Bootstrap routing after provisioning | `bootstrap/page.tsx:145/148`      | `!user.onboardingComplete`     | `/onboarding?redirect_url=...` or `safeTarget`               |
| OnboardingGuard UserNotProvisioned   | `onboarding/layout.tsx`           | DB lookup throws               | `redirect('/auth/bootstrap')` (no redirect_url!)             |
| OnboardingGuard onboardingComplete   | `onboarding/layout.tsx`           | `user.onboardingComplete=true` | `redirect('/users')`                                         |
| Middleware onboarding redirect       | `with-auth.ts:118`                | `isOnboardingRoute=true`       | **Skipped** — no middleware redirect for onboarding routes   |
| Middleware onboardingComplete        | `with-auth.ts:271`                | Edge mode                      | Always `true` — no DB check                                  |
| UsersLayout tenant probe             | `node-provisioning-access.ts:135` | `TENANCY_MODE=single`          | SQL probe on `tenants` table                                 |
| UsersLayout TENANT_CONTEXT_REQUIRED  | `users/layout.tsx:26`             | Probe returns false            | `redirect('/auth/bootstrap?reason=tenant-lost')`             |
| completeOnboarding re-provision      | `onboarding/actions.ts`           | Always called                  | Idempotent — no harm, minor overhead                         |

---

## 11. State Transitions: `users` Row

```
[not exists]
     ↓  ensureProvisioned() in BootstrapPage
[onboardingComplete = false]
     ↓  updateOnboardingStatus() in completeOnboarding action
[onboardingComplete = true]
```

Source of truth: `users.onboarding_complete` column in PGLite DB.  
No in-memory or cookie-based state used for this flag.

---

## 12. Identified Risks and Gaps

### MAJOR — `.env.local` Divergence

- **File**: `.env.local:36`
- **Impact**: New sign-ups hit `/onboarding` first, then `UserNotProvisionedError` → `/auth/bootstrap` → back to `/onboarding`. One extra server-side error thrown and redirect added per new sign-up.
- **Fix**: Set `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap` in `.env.local`.

### MAJOR — `OnboardingGuard` redirects to `/auth/bootstrap` without `redirect_url`

- **File**: `src/app/onboarding/layout.tsx`
- **Impact**: When `UserNotProvisionedError` is caught, `redirect('/auth/bootstrap')` has no `redirect_url` param. Bootstrap then uses default `safeTarget=/users`. Works correctly since bootstrap's own redirect brings user back to `/onboarding?redirect_url=%2Fusers`. However, if `safeTarget` logic were ever changed, this could silently route users away from onboarding.
- **Status**: Currently harmless; architecturally fragile.

### MAJOR — `getAppContainer()` creates fresh `Container` per call

- **File**: `src/core/runtime/bootstrap.ts`
- **Impact**: DB runtime is process-cached via `getInfrastructure()`, so no data loss. Container itself is not cached — unnecessary DI overhead on each request.
- **Owned by**: Architecture Guard Agent (previously flagged, not yet fixed).

### MINOR — `completeOnboarding` calls `ensureProvisioned()` redundantly

- **File**: `src/app/onboarding/actions.ts`
- **Impact**: User is already provisioned (they reached the form), so this is always a no-op. Idempotent by design. Minor overhead.
- **Risk**: None in correctness terms.

### MINOR — Edge `identity.id` ≠ Internal UUID

- **Surface**: `proxy.ts`, `with-auth.ts`
- **Impact**: Middleware has no concept of internal UUID. Any auth logging or tagging in middleware using `identity.id` emits Clerk external userId, not internal UUID. No authorization or data integrity risk.

---

## 13. Validation Commands

```bash
pnpm test          # 709 tests (115 files) — all paths have representative coverage
pnpm typecheck     # clean
pnpm lint          # clean
pnpm arch:lint     # clean
```

---

## 14. Summary Table: All Paths

| Path                        | Trigger                     | Steps      | Outcome                  | Risk            |
| --------------------------- | --------------------------- | ---------- | ------------------------ | --------------- |
| A — Happy Path              | New sign-up, `.env.example` | 11         | ✅ Users page rendered   | None            |
| B — `.env.local` Divergence | New sign-up, `.env.local`   | 11+1 extra | ✅ Works but extra hop   | MAJOR: fix env  |
| C — Returning User          | Existing, onboarded         | 4          | ✅ Direct to /users      | None            |
| D — Tenant Lost             | DB reset, tenant missing    | 5          | ✅ Tenant recovered      | None            |
| E — DB Error (ENOENT)       | PGLite data dir missing     | 3          | ✅ Actionable error UI   | None (post-fix) |
| F — Unauthenticated         | No Clerk session            | 1          | ✅ Redirected to sign-in | None            |
| G — Auth Route (Logged In)  | Signed in → /sign-up        | 1          | ✅ Redirected to /users  | None            |
