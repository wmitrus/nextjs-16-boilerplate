# Constraints Summary — Clerk Sign-Up & Provisioning Flow

**Synthesized from**: incident-intake.md, security-review.md, runtime-review.md, architecture-review.md  
**Date**: 2026-03-13  
**For**: Implementation Agent

---

## Task

Fix the unstable Clerk sign-up and provisioning flow. New users cannot complete sign-up in certain tenancy mode configurations. Specific failures:

1. `org+provider` mode: `orgId` absent at sign-up time → `TenantContextRequiredError` → user permanently stuck at bootstrap error page with no recovery path
2. `single` mode: `DEFAULT_TENANT_ID` not seeded in DB → `TenantNotProvisionedError` → same error UI, no startup validation
3. `org+db` mode: no cookie/header for new users → `TenantContextRequiredError` (by design, but undocumented)
4. `UsersLayout` → `TENANT_CONTEXT_REQUIRED` → `/onboarding` → `onboardingComplete=true` → `/users` → infinite redirect loop
5. `resolveActiveTenantIdForProvisioning()` duplicated identically in bootstrap and onboarding action — divergence risk

---

## Scope

The following are in scope:

- `src/app/auth/bootstrap/page.tsx` — detect org-absent state; render interstitial instead of error
- `src/app/auth/bootstrap/bootstrap-error.tsx` — extend or keep for hard error cases
- `src/app/onboarding/` — move `onboarding-actions.ts` here, update imports
- `src/modules/auth/ui/onboarding-actions.ts` — DELETE after move
- `src/app/users/layout.tsx` — fix `TENANT_CONTEXT_REQUIRED` redirect target
- `src/security/middleware/with-auth.ts` — reorder bootstrap/onboarding route check before `resolveIdentity()`
- One new shared server-side utility: `src/app/auth/build-provisioning-input.ts`
- `src/modules/provisioning/domain/errors.ts` import path fixes in bootstrap and onboarding (use public index)
- Optional: `ClerkUserRepository.ts` deprecation notice
- Optional: Clerk session claim documentation in `.env.example`

---

## Out of Scope

The following must NOT be changed as part of this incident fix:

- `ProvisioningInput` contract shape (`src/modules/provisioning/domain/ProvisioningService.ts`)
- `DrizzleProvisioningService` implementation and transaction logic
- `evaluateNodeProvisioningAccess` pure function (`src/security/core/node-provisioning-access.ts`)
- `ClerkRequestIdentitySource` claim extraction logic
- `RequestScopedIdentityProvider` DB lookup logic
- `DrizzleInternalIdentityLookup` implementation
- `createAuthModule()` tenant resolver wiring (AR-5 is a separate refactor, not part of this fix)
- `createRequestContainer()` / `getAppContainer()` composition root shape
- Any DB schema, Drizzle migrations, or seed scripts
- Any Clerk dashboard configuration
- The `personal` tenancy mode flow (it is not broken)
- Existing signed-in users, existing tenants, or existing membership records
- Any authorization module code

---

## Architecture Constraints

**AC-1 — Dependency direction must be preserved**

Allowed dependency directions per `docs/architecture/01 - Global Dependency Rules.md`:

- `app → modules/security/shared/core` ✓
- `modules → shared/core` ✓
- `security → shared/core` ✓

The extracted shared provisioning input utility must follow the same rules. If it lives in `src/modules/auth/`, it may not import from `src/app/`. If it lives in `src/app/auth/bootstrap/`, it may import from modules.

**AC-2 — `onboarding-actions.ts` must move to the delivery layer**

`src/modules/auth/ui/onboarding-actions.ts` → `src/app/onboarding/actions.ts`

Rationale: the server action orchestrates across provisioning + user modules. Cross-module orchestration belongs at the delivery (`app/`) or feature layer, not inside a module's `ui/` directory.

- The file move must be a pure relocation: no logic changes, no signature changes, no dependency additions
- `src/app/onboarding/onboarding-form.tsx` import path must be updated
- The old file at `modules/auth/ui/onboarding-actions.ts` must be deleted
- `modules/auth/ui/` retains only `HeaderWithAuth.tsx`, `HeaderAuthControls.tsx`, `HeaderAuthFallback.tsx`

**AC-3 — Extract `buildProvisioningInput()` as a single shared server-side utility**

Both `bootstrap/page.tsx` and `onboarding/actions.ts` must call the same utility to assemble `ProvisioningInput` from:

- `RequestIdentitySourceData` (already resolved by caller before passing in)
- Active tenant ID from request context (`headers()`, `cookies()`) for `org+db` mode
- Env vars: `AUTH_PROVIDER`, `TENANCY_MODE`, `TENANT_CONTEXT_SOURCE`

**Canonical location (decided)**: `src/app/auth/build-provisioning-input.ts`

Rationale:

- Both callers are in `src/app/` after the `onboarding-actions.ts` move — the delivery layer is the right home
- The function calls `headers()` and `cookies()` directly (Next.js framework APIs) — consistent with the delivery-layer pattern; module infrastructure injects these as constructor args rather than importing them directly
- Placing it under `src/app/auth/` (not under `src/app/auth/bootstrap/`) avoids scoping it to a single route and makes it equally accessible to `bootstrap/page.tsx` and `onboarding/actions.ts` without awkward cross-route-folder imports
- No module-layer file should need to import it; this is purely a delivery-layer assembly utility

This file must be server-only (it uses Next.js `headers()` / `cookies()` APIs). It must NOT be imported from client components.

**AC-4 — Use provisioning module's public index, not internal sub-paths**

Both callers must import from `@/modules/provisioning`, not from `@/modules/provisioning/domain/errors` or `@/modules/provisioning/domain/ProvisioningService` directly.

The provisioning public index (`src/modules/provisioning/index.ts`) already exports all needed symbols:

- `TenantContextRequiredError`
- `TenantUserLimitReachedError`
- `CrossProviderLinkingNotAllowedError`
- `ProvisioningService` (type)

**AC-5 — DI tokens must be used for all service resolution**

No direct instantiation of provisioning or user infrastructure in bootstrap page or onboarding action. Services must be resolved via `container.resolve(PROVISIONING.SERVICE)`, `container.resolve(AUTH.USER_REPOSITORY)`, etc.

**AC-6 — New client components must not import server-only modules**

Any new client component introduced for the `org+provider` interstitial (e.g., a "join org" UI component) must not import from `@/core/`, `@/modules/`, or any file using `next/headers`, `next/cookies`, or `'use server'`.

---

## Security / Auth Constraints

**SC-1 — Identity must always be established server-side**

The bootstrap page, onboarding action, and any new interstitial page must derive user identity exclusively from Clerk's server-side `auth()` API (via `ClerkRequestIdentitySource` resolved from DI container). Never accept user-submitted identity claims.

**SC-2 — Tenant authority sources by mode must not be weakened**

| Mode           | Trusted source                                 | Constraint                                                             |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `single`       | `env.DEFAULT_TENANT_ID` (server env)           | Never accept tenant ID from request                                    |
| `personal`     | Internal user UUID from DB                     | Never accept tenant ID from request                                    |
| `org+provider` | Clerk `orgId` JWT claim                        | Never accept org ID from client — only from Clerk SDK auth()           |
| `org+db`       | Header/cookie, validated against DB membership | Membership validation must run server-side before any tenant-scoped op |

**SC-3 — Provisioning write path must remain server-side and transactional**

`ensureProvisioned()` must only be called from server-side code (RSC pages, server actions). It must never be called from a route handler that does not validate identity, and never from a client component. The DB transaction in `DrizzleProvisioningService` must not be modified.

**SC-4 — No client-submitted tenant or org ID in provisioning input**

`ProvisioningInput.tenantExternalId` must always come from Clerk JWT (`auth()` → `orgId`). `ProvisioningInput.activeTenantId` must always come from server-side request context (headers/cookies), never from form data or query params submitted by the user.

**SC-5 — The interstitial UI for `org+provider` must use Clerk SDK client-side, not fabricate org state**

The interstitial page for "authenticated but no org context" must:

- Use Clerk's `<OrganizationSwitcher hidePersonal createOrganizationMode="modal" />` from `@clerk/nextjs`
- Trigger re-navigation to `/auth/bootstrap` only after Clerk confirms org selection (session token will contain updated `orgId`)
- NOT call any server action to create org records in the app DB directly (that is the provisioning service's job, triggered on re-run of bootstrap)
- NOT trust any org ID passed as a form field or query param as the authority for tenant context

**SC-6 — Cross-provider email linking policy must not be weakened**

The `CrossProviderLinkingNotAllowedError` catch block in both bootstrap and onboarding action must be preserved. Do not remove or change the error mapping.

**SC-7 — Bootstrap error UI must distinguish failure types**

The `BootstrapErrorUI` must not consolidate "no org context at sign-up time" and "hard configuration error" into a single undifferentiated error message. The `org+provider` interstitial is a distinct rendering path, not a variant of the `tenant_config` error.

**SC-8 — Sensitive data must not appear in new log statements**

Any new `logger.info` / `logger.warn` / `logger.error` calls must not log: Clerk session tokens, JWT values, email addresses as identifiers, internal UUIDs in combination with external IDs, or raw `err` objects that may contain stack traces with secrets. Log structural metadata (event, status, mode, boolean flags) only.

**SC-9 — `ClerkUserRepository.ts` must not be registered**

`src/modules/auth/infrastructure/ClerkUserRepository.ts` must remain unregistered. If a deprecation note is added as part of this fix, it must not change the DI wiring. Do not register it under `AUTH.USER_REPOSITORY`.

---

## Runtime Constraints

**RC-1 — All provisioning DB operations must run in Node runtime**

Bootstrap page, onboarding server action, and any new recovery page must call `getAppContainer()` only in Node-runtime contexts (RSC pages, layouts, server actions). Never in Edge-executed code.

**RC-2 — `proxy.ts` must remain Edge runtime**

Do not add `export const runtime = 'nodejs'` to `src/proxy.ts`. Do not add DB calls or imports to `proxy.ts`. The edge/node boundary documented in `docs/architecture/15 - Edge vs Node Composition Root Boundary.md` must be preserved.

**RC-3 — New pages and layouts in the auth flow must be dynamically rendered**

Any new page or layout added to the bootstrap or onboarding flow must use at least one dynamic API (`cookies()`, `headers()`, `auth()`, `searchParams`) to guarantee dynamic rendering under `cacheComponents: true` (PPR). Do not add `export const dynamic = 'force-dynamic'` unless the page has no other dynamic APIs — this is unnecessary when dynamic APIs are already used.

**RC-4 — New client components must be correctly placed**

Any client component added for the `org+provider` interstitial:

- Must have `'use client'` directive
- Must be returned from an RSC (e.g., `bootstrap/page.tsx`) conditionally
- Must receive needed data as props from the RSC — it must not re-fetch server-side data
- Must be a descendant of `<ClerkProvider>` in the render tree (already satisfied by root layout)

**RC-5 — `isBootstrapRoute`/`isOnboardingRoute` check must precede `resolveIdentity()` in `withAuth`**

In `src/security/middleware/with-auth.ts`, move the `isBootstrapRoute` and `isOnboardingRoute` early-exit checks to execute before the `resolveIdentity()` call. These routes are self-managing RSC pages and do not require identity resolution at the middleware level.

**RC-6 — `TENANT_CONTEXT_REQUIRED` must redirect to bootstrap, not onboarding**

In `src/app/users/layout.tsx`, the `TENANT_CONTEXT_REQUIRED` access status must redirect to `/auth/bootstrap?reason=tenant-lost`, not `/onboarding`. This breaks the documented redirect loop.

**RC-7 — Session refresh after Clerk org selection must be client-side only**

After the user creates or selects an org in the `org+provider` interstitial, the session token refresh is handled by Clerk's client-side SDK automatically. The implementation must trigger a full page navigation to `/auth/bootstrap` (via `window.location.replace` or `router.replace`) after Clerk fires its org-selection callback — not a soft client-side route transition that would skip the bootstrap RSC re-render.

**RC-8 — No request-scoped memoization across the new shared utility**

The extracted `buildProvisioningInput()` utility must not cache its result across requests. It reads from `headers()` / `cookies()` (request-scoped) and must remain stateless between calls.

---

## Validation Constraints

**VC-1 — TypeScript must pass with no new errors**

`pnpm typecheck` must pass after all changes.

**VC-2 — Existing unit tests must not regress**

`pnpm test` must pass. Affected test files: `bootstrap/page.test.tsx`, `onboarding-actions.test.ts` (at its new location), `with-auth.ts` tests if they exist.

**VC-3 — New tests are required for the new interstitial behavior**

The new `org+provider` bootstrap interstitial path must have at least one unit test covering:

- "authenticated with no orgId → renders interstitial, not error page"
- "authenticated with orgId → proceeds to provisioning"

**VC-4 — New tests are required for the redirect loop fix**

The `UsersLayout` redirect behavior for `TENANT_CONTEXT_REQUIRED` must be covered (mocked outcome → verify redirect target is `/auth/bootstrap?reason=tenant-lost`).

**VC-5 — The `buildProvisioningInput()` utility must have its own unit tests**

Cover all four tenancy modes and both org tenant context sources.

---

## Explicitly Allowed Changes

1. Add a new client component `src/app/auth/bootstrap/bootstrap-org-required.tsx` (or similar) for the `org+provider` interstitial — renders Clerk org UI and re-navigates to bootstrap after org selection
2. Extract `buildProvisioningInput()` as a new server-side utility (see AC-3 for location options)
3. Move `src/modules/auth/ui/onboarding-actions.ts` → `src/app/onboarding/actions.ts` (pure file move)
4. Update `src/app/onboarding/onboarding-form.tsx` import path for the moved server action
5. Delete `src/modules/auth/ui/onboarding-actions.ts` after move
6. Update `src/app/auth/bootstrap/page.tsx` to detect `tenantExternalId === undefined` in `org+provider` mode and render the interstitial component instead of calling `ensureProvisioned`
7. Update `src/app/users/layout.tsx`: `TENANT_CONTEXT_REQUIRED` → redirect to `/auth/bootstrap?reason=tenant-lost`
8. Update `src/security/middleware/with-auth.ts`: move `isBootstrapRoute`/`isOnboardingRoute` guard before `resolveIdentity()`
9. Fix import paths in `bootstrap/page.tsx` and `onboarding/actions.ts`: use `@/modules/provisioning` (public index) instead of `@/modules/provisioning/domain/errors`
10. Add deprecation comment to `ClerkUserRepository.ts`
11. Add Clerk session claim documentation to `.env.example` or `ClerkRequestIdentitySource.ts`
12. Add or update tests for all changed paths

---

## Explicitly Forbidden Changes

1. **DO NOT** change `ProvisioningInput` interface shape in `src/modules/provisioning/domain/ProvisioningService.ts`
2. **DO NOT** modify `DrizzleProvisioningService` — no changes to its transaction logic, SQL, or error throws
3. **DO NOT** modify `evaluateNodeProvisioningAccess` in `src/security/core/node-provisioning-access.ts`
4. **DO NOT** modify `ClerkRequestIdentitySource` claim extraction
5. **DO NOT** add `export const runtime = 'nodejs'` to `src/proxy.ts`
6. **DO NOT** add DB calls or module imports to `src/proxy.ts`
7. **DO NOT** register `ClerkUserRepository` as `AUTH.USER_REPOSITORY` in any container
8. **DO NOT** accept any client-submitted org ID, tenant ID, or role claim as the authority source for provisioning input
9. **DO NOT** auto-create Clerk organizations from server-side code (no Clerk Management API calls from bootstrap or onboarding)
10. **DO NOT** move the `TENANT_CONTEXT_REQUIRED` case to `/onboarding` — it causes the documented redirect loop
11. **DO NOT** route `TENANT_CONTEXT_REQUIRED` from `UsersLayout` to any page that guards by `onboardingComplete === true`
12. **DO NOT** combine the tenant resolver wiring refactor (AR-5 from architecture-review.md) with this incident fix — that is a separate refactor
13. **DO NOT** combine any DB schema changes or migrations with this fix
14. **DO NOT** add caching to auth-sensitive RSC pages (`no-store`, `force-cache`, `revalidate`) — all pages in the bootstrap/onboarding flow must remain fully dynamic
15. **DO NOT** expose `CLERK_SECRET_KEY` or any server env var to client components
16. **DO NOT** call `ensureProvisioned` from Edge runtime (proxy.ts, edge middleware callbacks)

---

## Protected Invariants

These behaviors must be unchanged after the fix:

| Invariant                                                                            | Owner                                                             | Verified in               |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------- |
| `ensureProvisioned` is idempotent — safe to call multiple times for same user+tenant | `DrizzleProvisioningService`                                      | Existing DB tests         |
| `ensureProvisioned` runs all steps in a single atomic DB transaction                 | `DrizzleProvisioningService`                                      | Existing DB tests         |
| `ensureProvisioned` never escalates an existing membership role                      | `DrizzleProvisioningService`                                      | Existing DB tests         |
| `ensureProvisioned` enforces free-tier user limits before new membership inserts     | `DrizzleProvisioningService`                                      | Existing DB tests         |
| `Identity.id` in Node paths is always an internal UUID (never external provider ID)  | `RequestScopedIdentityProvider` + `DrizzleInternalIdentityLookup` | Existing unit tests       |
| Cross-provider email linking policy is enforced at provisioning time                 | `DrizzleProvisioningService`                                      | Existing unit tests       |
| Bootstrap route passes through middleware without identity DB lookup                 | `withAuth` (Edge, `isBootstrapRoute=true`)                        | Existing middleware tests |
| Onboarding route passes through middleware without provisioning check                | `withAuth` (Edge, `isOnboardingRoute=true`)                       | Existing middleware tests |
| `personal` mode works end-to-end (not broken by this fix)                            | Bootstrap + Provisioning + OnboardingGuard                        | Must remain untouched     |
| Redirect URL sanitization via `sanitizeRedirectUrl` before any redirect              | `bootstrap/page.tsx`, `onboarding/actions.ts`                     | Existing tests            |
| Unauthenticated users at bootstrap are redirected to `/sign-in`                      | `bootstrap/page.tsx`                                              | Existing tests            |

---

## Open Questions / Blocks

**OQ-1 — `single` mode startup probe: DEFERRED to follow-up**

The startup DB probe to verify `DEFAULT_TENANT_ID` existence is explicitly out of scope for this fix.

Rationale: the main goal of this incident fix is to close the sign-up/provisioning failures with low blast radius. Adding a DB probe to the instrumentation or boot path increases the surface of the change without addressing the immediate user-facing failures.

**Deferred action**: Track as a follow-up task — add a boot-time or lazy probe to `instrumentation.ts` or `bootstrap/page.tsx` after this fix ships and stabilizes.

**OQ-2 — `org+provider` interstitial: RESOLVED — use `<OrganizationSwitcher>`**

**Decision**: Use `<OrganizationSwitcher hidePersonal createOrganizationMode="modal" />` from `@clerk/nextjs`.

Rationale:

- `<OrganizationSwitcher>` covers both cases in a single component: invited users can switch to an existing org; self-service users can create a new one via the modal
- `hidePersonal` suppresses the "Personal Account" option, which is semantically wrong in `org+provider` mode (the app requires an org, not a personal Clerk session)
- `createOrganizationMode="modal"` keeps the user on the interstitial page while creating an org, so the post-creation navigation to `/auth/bootstrap` can be controlled by the app
- After Clerk fires its org-selection/creation callback, the interstitial triggers `window.location.replace('/auth/bootstrap')` — a full navigation that re-runs bootstrap with the updated session token

This is purely a UX and Clerk SDK usage decision. It does not affect trust boundaries.

**OQ-3 — `org+db` mode documentation scope**

The `org+db` mode has no self-service sign-up path by design (invitation-only). This is correct behavior. The constraint: should the bootstrap error UI explicitly show "You need an invitation to access this workspace" for `org+db` mode, or is the generic `tenant_config` error acceptable?

**Decision needed**: This is a UX decision. The implementation agent should add a mode-specific message for `org+db` (distinguishable from `org+provider`) to avoid operator confusion. This is low blast radius.

**OQ-4 — `withAuth` reordering: behavior change for partial auth state**

Moving the `isBootstrapRoute` check before `resolveIdentity()` means that for bootstrap routes, `resolveIdentity()` is never called in middleware. Today it is called (and succeeds because Edge identity provider has no DB lookup). After the change, the middleware context object passed to the handler will have no `identity` field set for bootstrap routes.

**Verify**: Does any downstream middleware or security pipeline step read `ctx.identity` for bootstrap routes? If yes, the reordering must ensure the field is set to a safe default (e.g., `null`) before the early-exit.

**OQ-5 — `BootstrapErrorUI` flash-of-null on initial load**

The root layout wraps `<ClerkProvider>` in `<Suspense fallback={null}>`. New client components added for the interstitial will also have this flash. This is a known UX limitation (not a functional bug) and is out of scope for this fix. Noted for future improvement.
