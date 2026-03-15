# Runtime Flow Review: sign-up → bootstrap → onboarding → /users

**Date**: 2026-03-15  
**Scope**: Post-PGlite reset + migration; full runtime path analysis  
**Context**: `pnpm db:reset:pglite` + `pnpm db:migrate:cli` completed

---

## 1. Objective

Validate the full sign-up → bootstrap → onboarding → /users runtime execution path after PGlite reset and migration, identify remaining RSC stream abort risks, unsafe error propagation patterns, and the root cause of the Cloudflare CSP violation.

---

## 2. Current-State Findings

### Verified runtime flow diagram

```
[Browser] Sign-up
  → /sign-up/page.tsx          (Server Component, Node)
      └─ SignUpClient           (Client Component — Clerk <SignUp> widget)
          └─ Clerk handles auth, Cloudflare Turnstile bot check
          └─ On success → redirect to NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL

[Edge] proxy.ts (clerkMiddleware + security pipeline)
  → withSecurity → withInternalApiGuard → withRateLimit → withAuth
  → withHeaders sets CSP on EVERY response including /auth/bootstrap

[Node] /auth/bootstrap/page.tsx (async Server Component)
  ├─ getAppContainer()                          ← new Container per request
  │   └─ getInfrastructure()                    ← CACHED at process scope (PGlite singleton)
  ├─ identitySource.get()                       ← Clerk auth(), NO DB TOUCH ✅
  ├─ [guard] rawIdentity.userId check
  ├─ [guard] TENANCY_MODE=org check
  ├─ provisioningService.ensureProvisioned()    ← TRY/CATCH ✅
  │   └─ DrizzleProvisioningService.runInTransaction()
  │       └─ PGlite → Drizzle → DB queries
  ├─ logger.info() on success
  ├─ internalUserId = result.internalUserId
  ├─ userRepository.findById(internalUserId)    ← ⚠️ OUTSIDE try/catch
  ├─ [guard] !user → throw new Error()          ← ⚠️ UNCAUGHT — RSC abort
  ├─ [guard] !user.onboardingComplete → redirect('/onboarding?...')
  └─ redirect(safeTarget)

[Node] /onboarding/layout.tsx — OnboardingGuard (async Server Component)
  ├─ getAppContainer()
  ├─ identityProvider.getCurrentIdentity()      ← catches UserNotProvisionedError only
  │   └─ Other errors → ⚠️ UNCAUGHT — RSC abort
  ├─ userRepository.findById(identity.id)       ← ⚠️ OUTSIDE try/catch — RSC abort
  └─ user.onboardingComplete check → redirect('/users')

[Node] /onboarding/actions.ts — completeOnboarding() (Server Action)
  ├─ getAppContainer()
  ├─ identitySource.get()
  ├─ provisioningService.ensureProvisioned()    ← TRY/CATCH ✅ (all errors mapped)
  ├─ userRepository.findById(internalUserId)    ← ⚠️ OUTSIDE try/catch
  │   └─ throw new Error() if user missing      ← ⚠️ UNCAUGHT — server action crash
  ├─ userRepository.updateProfile()             ← TRY/CATCH ✅
  ├─ userRepository.updateOnboardingStatus()    ← TRY/CATCH ✅
  └─ redirect(safeRedirectUrl)

[Node] /users/layout.tsx (async Server Component)
  ├─ resolveNodeProvisioningAccess(getAppContainer())
  │   ├─ identityProvider.getCurrentIdentity() ← throws non-UserNotProvisionedError? → ⚠️ UNCAUGHT
  │   ├─ db.execute(sql`SELECT id FROM tenants...`) ← ⚠️ raw DB call, no catch
  │   └─ userRepository.findById()
  └─ Redirect logic based on access.status

[Client] /users/page.tsx (Client Component)
  ├─ useEffect → getUsers() API call
  ├─ logger.info/debug/warn/error (client logger) ← ✅ safe
  └─ ErrorAlert / retry UI for API failures
```

---

## 3. Runtime Boundary Assessment

### Server vs Client Placement

| Component                                     | Runtime                              | Placement                               |
| --------------------------------------------- | ------------------------------------ | --------------------------------------- |
| `/sign-up/page.tsx`                           | Node (Server Component)              | Correct — just renders SignUpClient     |
| `SignUpClient`                                | Browser (Client Component)           | Correct — Clerk widget requires browser |
| `/auth/bootstrap/page.tsx`                    | Node (Server Component)              | Correct — auth + provisioning logic     |
| `BootstrapErrorUI`                            | Browser (`'use client'`)             | Correct — uses `useClerk`, `useRouter`  |
| `BootstrapOrgRequired`                        | Browser (`'use client'`)             | Correct — uses `OrganizationSwitcher`   |
| `/onboarding/layout.tsx` OnboardingGuard      | Node (Server Component)              | Correct — DB access needed              |
| `OnboardingForm`                              | Browser (`'use client'`)             | Correct — form interaction              |
| `/onboarding/actions.ts` `completeOnboarding` | Node (Server Action, `'use server'`) | Correct                                 |
| `/users/layout.tsx`                           | Node (Server Component)              | Correct — auth gate                     |
| `/users/page.tsx`                             | Browser (`'use client'`)             | Correct — data fetching with state      |

### Edge vs Node Placement

- **Edge**: `src/proxy.ts` — Clerk middleware, security pipeline, CSP headers
- **Node**: All page/layout Server Components, Server Actions, `DrizzleProvisioningService`, PGlite

PGlite is correctly excluded from edge via `serverExternalPackages` in `next.config.ts`:

```typescript
serverExternalPackages: [
  '@electric-sql/pglite',
  'pino',
  'pino-logflare',
  'pino-pretty',
];
```

This prevents these Node-only packages from being bundled for edge.

### Caching and Rendering Mode

- Bootstrap, onboarding layout, users layout are all **dynamic** (they read Clerk auth state, user data)
- `getAppContainer()` is called per-request with no `cache()` wrapper — correct, PGlite is not safe to cache across request contexts
- `getInfrastructure()` IS cached at process scope — correct for PGlite singleton
- No static rendering risks identified for auth-gated routes

### Logger Safety in Render Pipeline

| Call site                                                                  | Mode                    | Safe?                 |
| -------------------------------------------------------------------------- | ----------------------- | --------------------- |
| `resolveServerLogger()` at module scope in `ClerkRequestIdentitySource.ts` | Process-level singleton | ✅ safe               |
| `resolveServerLogger()` at module scope in `DrizzleProvisioningService.ts` | Process-level singleton | ✅ safe               |
| `resolveServerLogger()` at module scope in `page.tsx`                      | Process-level singleton | ✅ safe               |
| `resolveServerLogger()` at module scope in `actions.ts`                    | Process-level singleton | ✅ safe               |
| All `logger.info/warn/error/debug()` calls                                 | pino synchronous writes | ✅ cannot throw/crash |

pino writes synchronously (`sync: true` in `createFileStream`). No logger call can interrupt RSC rendering.

---

## 4. Remaining RSC Stream Abort Risks

### Risk 1 — MAJOR: `userRepository.findById()` after provisioning (bootstrap page)

**File**: `src/app/auth/bootstrap/page.tsx`  
**Location**: After the `try/catch` block, at `const user = await userRepository.findById(internalUserId)`

```typescript
// ─── OUTSIDE try/catch ───────────────────────────────────────────
const userRepository = container.resolve<UserRepository>(AUTH.USER_REPOSITORY);
const user = await userRepository.findById(internalUserId);

if (!user) {
  logger.error(
    { event: 'provisioning:bootstrap', status: 'invariant_violated' },
    '...',
  );
  throw new Error(
    'Bootstrap invariant violated: provisioned user not found in database',
  );
  //              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //              UNCAUGHT — propagates to Next.js RSC → ERR_INCOMPLETE_CHUNKED_ENCODING
}
```

If `userRepository.findById()` throws a DB error (e.g., PGlite state corruption on hot-reload), the throw is uncaught. Even the invariant `throw new Error(...)` is uncaught and will abort the RSC stream. The root `error.tsx` error boundary will catch this in the browser, but the RSC stream still terminates abnormally.

### Risk 2 — MAJOR: `userRepository.findById()` in onboarding Server Action

**File**: `src/app/onboarding/actions.ts`  
**Location**: After provisioning succeeds, `const existingUser = await userRepository.findById(internalUserId)`

```typescript
const existingUser = await userRepository.findById(internalUserId);
if (!existingUser) {
  logger.error({ userId: internalUserId }, '...');
  throw new Error(
    'Onboarding invariant violated: provisioned user not found in database',
  );
  // UNCAUGHT in server action — propagates as unhandled server action error
}
```

Server Actions that throw are handled by Next.js' error serialization, but without a structured `{ error: string }` return, the client receives a generic server error. The `OnboardingForm` has a `catch (_err)` that shows a generic error message, so UX degrades gracefully — but the throw is still unhandled server-side.

### Risk 3 — MAJOR: Non-`UserNotProvisionedError` throws in `OnboardingGuard`

**File**: `src/app/onboarding/layout.tsx`

```typescript
try {
  identity = await identityProvider.getCurrentIdentity();
} catch (err) {
  if (err instanceof UserNotProvisionedError) {
    redirect('/auth/bootstrap');
  }
  throw err; // ← ALL other errors are re-thrown → RSC stream abort
}
// ...
const user = await userRepository.findById(identity.id); // ← OUTSIDE try/catch
```

If `getCurrentIdentity()` throws a non-`UserNotProvisionedError` DB error, or `userRepository.findById()` throws, the error is uncaught and aborts the RSC stream for the entire `/onboarding` layout subtree.

### Risk 4 — MAJOR: `resolveNodeProvisioningAccess` in users layout (no try/catch)

**File**: `src/app/users/layout.tsx`

```typescript
const access = await resolveNodeProvisioningAccess(getAppContainer());
// No try/catch. If this throws, RSC stream for /users/* aborts.
```

Inside `resolveNodeProvisioningAccess`:

- `identityProvider.getCurrentIdentity()` — only `UserNotProvisionedError` is mapped; others propagate
- `db.execute(sql`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`)` — raw DB call, no error handling

Any unexpected DB error in this path aborts the users layout RSC stream with no error boundary at the layout level.

### Risk 5 — INFORMATIONAL: PGlite `postmaster.pid` recurrence

The root cause from the previous investigation (stale `postmaster.pid` → WASM abort → `process.exit()`) is now cleared via `db:reset:pglite`. However, it **will recur** if:

- The dev server is killed with SIGKILL (e.g., `kill -9`, OOM killer, power loss)
- Turbopack HMR causes the Node process to exit abnormally
- Any SIGKILL scenario bypasses the registered SIGINT/SIGTERM shutdown hooks

The `closeInfrastructure()` cleanup only runs on `beforeExit`, `SIGINT`, and `SIGTERM` — not on `SIGKILL` or crashes.

**Mitigation** (low blast radius, can be done without code change): Add a `predev` script in `package.json` that deletes `postmaster.pid` before `pnpm dev` starts:

```json
"predev": "node -e \"const fs=require('fs'); const p='./data/pglite/postmaster.pid'; try{fs.unlinkSync(p); console.log('[predev] Removed stale postmaster.pid');}catch{}\"",
```

---

## 5. CSP / Cloudflare Turnstile Issue

### Root Cause

**This CSP error is NOT caused by the repository's CSP configuration. It is NOT fixed by the PGlite reset.**

#### What the error reports

```
challenges.cloudflare.com/…normal?lang=en-us:1   script-src   blocked
```

This is a CSP violation reported from within the **Cloudflare Turnstile iframe** (`<iframe src="https://challenges.cloudflare.com/...">`). The iframe is embedded by Clerk's `<SignUp>` component for bot protection.

#### Why the parent page's CSP does not resolve it

The parent page's CSP (set by `withHeaders` in `src/security/middleware/with-headers.ts`) correctly includes:

```
script-src: 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com ...
frame-src:  'self' https://challenges.cloudflare.com ...
```

However, the CSP violation is occurring **inside the Cloudflare iframe**, not in the parent page context. Cross-origin iframes enforce their **own CSP response headers** from Cloudflare's servers. The parent page's `'unsafe-eval'` does **not propagate** into the iframe's script execution context.

Cloudflare's own CSP on `challenges.cloudflare.com` pages restricts `eval()` to their own trusted scripts. When their Turnstile challenge page loads internal JS that uses eval, the violation is reported to the browser console and attributed to the script's source URL.

#### Is it blocking functionality?

The Cloudflare Turnstile CSP violation is a **browser console warning** originating from Cloudflare's own iframe context. It does not prevent the Turnstile widget from functioning — Cloudflare controls their own frame's execution environment. Clerk sign-up works despite the console warning.

#### What the repository CAN verify

The parent page's CSP is structurally sound. `'unsafe-eval'` is correctly included in `script-src` and `script-src-elem`. `https://challenges.cloudflare.com` is included in `script-src`, `frame-src`, and `connect-src`. There is nothing wrong with the repository's CSP configuration.

#### What is NOT fixable by repository code

The Cloudflare iframe's internal CSP policy is controlled by Cloudflare, not by this repository. Adding any additional directives to the parent page's CSP (e.g., `'wasm-unsafe-eval'`) would not affect CSP enforcement inside the cross-origin iframe.

**Verdict**: CSP error is a Cloudflare Turnstile iframe internal behavior. It is NOT related to the bootstrap/PGlite fix. The repository's CSP is correctly configured. No code change is required.

---

## 6. Is the current implementation production-safe?

| Concern                                           | Status                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Bootstrap page — provisioning error handling      | ✅ Comprehensive catch block covering domain errors + WASM/FS errors |
| Bootstrap page — post-provisioning user lookup    | ⚠️ UNCAUGHT throw if DB fails after provisioning                     |
| Onboarding layout — identity resolution           | ⚠️ Only `UserNotProvisionedError` caught; DB errors abort RSC stream |
| Onboarding layout — user lookup                   | ⚠️ OUTSIDE try/catch                                                 |
| Onboarding action — post-provisioning user lookup | ⚠️ UNCAUGHT throw                                                    |
| Users layout — full access resolution             | ⚠️ No try/catch; DB errors abort RSC stream                          |
| PGlite singleton lifecycle                        | ⚠️ WASM abort recurs on SIGKILL; no pre-dev cleanup                  |
| Logger in render path                             | ✅ pino synchronous, cannot crash render                             |
| Client/Server boundary correctness                | ✅ All placements correct                                            |
| Edge/Node runtime correctness                     | ✅ PGlite excluded from edge bundle                                  |
| CSP configuration                                 | ✅ Correctly configured for all required origins                     |
| Cloudflare Turnstile CSP warning                  | ℹ️ Cloudflare internal, not repository-fixable                       |

**Overall verdict**: The bootstrap flow is now **structurally functional** after the PGlite reset and migration. The most significant remaining risks are uncaught throws from `userRepository.findById()` after provisioning in both the bootstrap page and the onboarding action, and the lack of a try/catch in `UsersLayout`. These are **correctness gaps** that would surface only when PGlite is in a degraded state (which is unlikely post-reset), but they represent real RSC stream abort risks that should be addressed.

---

## 7. Recommended Next Actions

### Priority 1 — Low blast radius, high value

**Add generic DB error catch to bootstrap page** (`src/app/auth/bootstrap/page.tsx`):

Extend the catch block to cover unhandled DB errors that reach `userRepository.findById()`, OR wrap the post-provisioning lookup in its own try/catch returning `<BootstrapErrorUI error="db_error" />`.

### Priority 2 — Low blast radius

**Add `predev` script for PGlite `postmaster.pid` cleanup** (`package.json`):

Prevents the WASM abort recurrence on next SIGKILL + dev server restart cycle. One-liner addition.

### Priority 3 — Medium blast radius

**Wrap `resolveNodeProvisioningAccess` in users layout** and **OnboardingGuard layout DB calls** in try/catch with explicit redirect to `/auth/bootstrap?reason=db-error`.

### Priority 4 — Informational (no code change needed)

Cloudflare CSP warning: already correctly handled by the existing CSP configuration. No action needed.
