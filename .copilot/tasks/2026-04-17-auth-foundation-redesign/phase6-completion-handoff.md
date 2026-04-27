# Auth Foundation Redesign — Phase 7 Entry Handoff

**Date**: 2026-04-20
**Branch**: `fix/db-setup`
**Task ID**: `2026-04-17-auth-foundation-redesign`
**Master Plan**: `.copilot/tasks/2026-04-17-auth-foundation-redesign/plan.md`
**Leantime Epic Task ID**: 55

---

## Current State: Phases 1–6 Complete ✅

All phases up to and including Phase 6 are complete. The codebase is on branch `fix/db-setup` with the following validation state:

- **Typecheck**: 0 errors
- **Lint**: 0 errors
- **Unit tests**: 1031/1031 passing
- **Git status**: Phases 1–6 files are unstaged (not yet committed — intentional, user controls commit timing)

---

## What Was Built (Phases 1–6 Summary)

### Phase 1 — DB Schema Restructure ✅

- `organizations`, `invitations`, `waitlist_entries` tables added
- `auth_tenant_identities` → `auth_organization_identities` renamed
- FK columns renamed: `tenant_id` → `organization_id` across memberships/roles/policies
- Migration: `0008_auth_foundation_redesign.sql`

### Phase 2 — Contract Redesign ✅

- `OrganizationId` primitive type added in `src/core/contracts/primitives.ts`
- `orgExternalId` replaces `tenantExternalId` in `RequestIdentitySourceData`
- `findInternalOrganizationId()` replaces `findInternalTenantId()` in `InternalIdentityLookup`
- `internalOrganizationId` replaces `internalTenantId` in `ProvisioningResult`
- `organizationId` added to `TenantContext`

### Phase 3 — Provisioning Service Rework ✅

- Resolver classes renamed: `OrgDbOrganizationResolver`, `ProviderOrganizationResolver`, `PersonalOrganizationResolver`
- `DrizzleProvisioningService` internal vars cleaned up
- Domain/diagnostic field renames throughout

### Phase 4 — Dead Code Removal + Clerk Coupling Fix ✅

- `ClerkUserRepository` deleted (was dead code + security violation)
- `useSignOut` hook created at `src/modules/auth/ui/hooks/useSignOut.ts`
- `WorkspaceSwitcher` abstraction at `src/modules/auth/ui/WorkspaceSwitcher.tsx`
- `waitlist/page.tsx` now has `AUTH_PROVIDER` guard
- Clerk import audit completed

### Phase 5 — Invitation System ✅

- Module: `src/modules/invitations/` (domain, infrastructure/drizzle, infrastructure/clerk, ui)
- `POST /api/auth/invite` — create invitation
- `GET /api/auth/invite/[token]` — validate token
- `POST /api/auth/invite/[token]` — accept invitation
- `InviteMemberForm` UI component
- `ClerkInvitationBridge` (non-fatal, delegates to Clerk API)
- `NoOpEmailService` stub (direct email sending deferred to Phase 7 AuthJS)

### Phase 6 — Registration Mode + Waitlist ✅

- `REGISTRATION_MODE=open|invite-only|disabled` env var in `src/core/env.ts`
- `withRegistrationMode` Edge guard in `src/security/middleware/with-registration-mode.ts`, wired into `src/proxy.ts`
- `src/modules/waitlist/` module (domain, infrastructure/drizzle, infrastructure/clerk, ui)
- `POST /api/auth/waitlist` — join waitlist
- `GET /api/admin/waitlist` — list pending (admin)
- `POST /api/admin/waitlist/[id]?action=approve|reject` — admin approve/reject
- `WaitlistJoinForm` UI component
- `ClerkWaitlistBridge` — documented no-op (Clerk manages waitlist UI-side via its `Waitlist` component)
- `src/app/auth/registration-closed/page.tsx` — shown when `REGISTRATION_MODE=disabled`
- `src/app/waitlist/page.tsx` — updated to be provider-agnostic

---

## Phase 7: AuthJS Adapter — What Must Be Built

**Plan reference**: `.copilot/tasks/2026-04-17-auth-foundation-redesign/plan.md` → Phase 7 section

### Steps

```
Step 7.1:  Install next-auth package
Step 7.2:  Create src/modules/auth/infrastructure/authjs/auth.config.ts (Edge-safe)
Step 7.3:  Create src/modules/auth/infrastructure/authjs/auth.ts (Node-only)
Step 7.4:  Implement AuthJsRequestIdentitySource (replace stub with real session read)
Step 7.5:  Create AuthJsEdgeIdentitySource for proxy.ts
Step 7.6:  Auth.js route handler /api/auth/[...nextauth]/route.ts
Step 7.7:  SessionProvider wrapper component
Step 7.8:  Custom sign-in page /auth/signin
Step 7.9:  Custom sign-up page /auth/signup
Step 7.10: Custom organization switcher (DB-based, replaces Clerk OrganizationSwitcher)
Step 7.11: Wire into auth module factory
```

### Pause point (per plan)

After Phase 7: AuthJS provider switching must be tested by changing `AUTH_PROVIDER=authjs` in `.env.local` and verifying the full auth flow works.

---

## Key Architecture Context for Phase 7

### How the auth module factory works

`src/modules/auth/index.ts` — `createAuthModule()` switches on `env.AUTH_PROVIDER`:

- `'clerk'` → `ClerkRequestIdentitySource` (fully implemented)
- `'authjs'` → `AuthJsRequestIdentitySource` (currently a **stub that throws**)
- `'supabase'` → `SupabaseRequestIdentitySource` (stub that throws)
- `'neon'` → `NeonRequestIdentitySource` (stub that throws)

### Existing AuthJS stub (must be replaced)

`src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`:

```typescript
export class AuthJsRequestIdentitySource implements RequestIdentitySource {
  get(): Promise<RequestIdentitySourceData> {
    throw new Error(
      '[authModule] AUTH_PROVIDER=authjs is not yet implemented...',
    );
  }
}
```

Its test (`AuthJsRequestIdentitySource.test.ts`) asserts the stub throws — **must be updated** when the real implementation lands.

### Key contract to implement

`RequestIdentitySource.get()` must return `RequestIdentitySourceData`:

```typescript
interface RequestIdentitySourceData {
  readonly userId?: string; // External Auth.js user ID
  readonly email?: string; // Email from session
  readonly emailVerified?: boolean; // Whether provider verified the email
  readonly orgExternalId?: string; // External org ID (for multi-org; may be absent)
  readonly tenantRole?: string; // Role string from provider
}
```

### Edge vs Node runtime constraint

**Critical**: `cacheComponents: true` is active → NO `export const runtime` or `export const dynamic` allowed anywhere. Use `await connection()` for dynamic rendering in route handlers and RSC pages.

`src/proxy.ts` runs at the Edge. Auth.js has an **Edge-safe** config (`auth.config.ts`) and a **Node-only** full config (`auth.ts`). The Edge identity source (`AuthJsEdgeIdentitySource`) must only use `auth.config.ts`.

### How proxy.ts is structured

`src/proxy.ts` — NOT `middleware.ts`. Uses `clerkMiddleware` when `AUTH_PROVIDER=clerk`. For `AUTH_PROVIDER=authjs`, the proxy must use Auth.js's `auth()` from the Edge-safe config instead of `clerkMiddleware`.

The current pipeline in proxy.ts:

1. `withSecurity` (classification, correlation, security headers)
2. `withInternalApiGuard`
3. `withRateLimit`
4. `withRegistrationMode` ← added in Phase 6
5. `withAuth` (session presence gate)
6. `terminalHandler`

For AuthJS: the Clerk-specific `clerkMiddleware()` wrapping must be gated behind `AUTH_PROVIDER === 'clerk'`. For `AUTH_PROVIDER === 'authjs'`, use `nonClerkProxy` with Auth.js session extraction injected into the identity source.

### Clerk-specific code that must remain gated

`src/app/layout.tsx` — has `ClerkProvider` (gated by `AUTH_PROVIDER=clerk`, or needs to be)
`src/app/auth/sign-in-client.tsx` / `sign-up-client.tsx` — use Clerk UI components

For Phase 7, Auth.js equivalents are custom pages (`/auth/signin`, `/auth/signup`).

### WorkspaceSwitcher

`src/modules/auth/ui/WorkspaceSwitcher.tsx` — currently wraps Clerk's `OrganizationSwitcher`. Step 7.10 must add a DB-based alternative for AuthJS (reads organizations from DB and lets user switch active org context via cookie/header).

---

## Repository Non-Negotiables (AGENTS.md)

1. **`cacheComponents: true`** — bans `export const dynamic` and `export const runtime`. Use `await connection()` instead.
2. **No `middleware.ts`** — middleware is `src/proxy.ts`.
3. **`pnpm lint --fix`** (not plain `pnpm lint`) — auto-fixes import order.
4. **React Compiler active** — no manual `useMemo`/`useCallback`/`memo`.
5. **SEC-10**: Never log raw Error objects — use `errorMessage: error.message`, `errorName: error.name`.
6. **Pattern G** for mocking `next/server` in tests: `vi.mock('next/server', async () => { const actual = await vi.importActual('next/server'); ... })`.

---

## How to Continue: Prompt for Next AI Chat

Copy and paste the following as your opening message in the next AI session:

---

```
Auth Foundation Redesign — Phase 7: AuthJS Adapter
We are on branch fix/db-setup. Phases 1–6 are complete (all tests green, typecheck/lint clean).

Read the full handoff document first:
  .copilot/tasks/2026-04-17-auth-foundation-redesign/phase6-completion-handoff.md

Then read the master plan:
  .copilot/tasks/2026-04-17-auth-foundation-redesign/plan.md

Start Phase 7 (AuthJS Adapter Implementation) — Steps 7.1 through 7.11 as listed in the plan.

Key constraints:
- next-auth is NOT yet installed (Step 7.1 must install it first)
- AuthJsRequestIdentitySource exists at src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts but is a stub that throws — Step 7.4 replaces it
- src/proxy.ts (NOT middleware.ts) is the middleware-equivalent; must be updated for AUTH_PROVIDER=authjs
- cacheComponents: true bans export const dynamic/runtime — use await connection() instead
- After Phase 7 implementation: typecheck must pass, 1031+ unit tests must pass, and AUTH_PROVIDER=authjs must be manually testable by changing .env.local

Use the Workflow Orchestrator role throughout.
```

---

## Validation Baseline (Entry Criteria for Phase 7)

| Check                | Status              |
| -------------------- | ------------------- |
| `pnpm typecheck`     | ✅ 0 errors         |
| `pnpm lint --fix`    | ✅ 0 errors         |
| `pnpm test -- --run` | ✅ 1031/1031 passed |
| Branch               | `fix/db-setup`      |
| Phase 5              | ✅ Complete         |
| Phase 6              | ✅ Complete         |
