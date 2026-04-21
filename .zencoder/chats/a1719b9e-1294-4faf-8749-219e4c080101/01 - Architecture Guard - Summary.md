# 01 - Architecture Guard - Summary

## Task Context

- **Task ID**: `a1719b9e-1294-4faf-8749-219e4c080101`
- **Task Objective**: Design production-ready password reset flow for AuthJS adapter
- **Current Run Scope**: Phase 2 — architecture design for password reset; remediation of insecure Phase 1 set-password
- **Status**: COMPLETED
- **Last Updated**: 2026-04-21
- **Related Control Artifacts**: `plan.md`, `02 - Security & Auth - Summary.md`

---

## Scope Handled

- **Modules / layers reviewed**: `src/modules/auth/`, `src/app/auth/`, `src/app/api/auth/`, `src/core/db/`
- **Change surface reviewed**: New `password_reset_tokens` table, new API routes, new pages, sign-in UX, removal of insecure set-password
- **Architecture questions in scope**: Where does the token table belong? How do reset routes fit in the existing auth module structure?

---

## Inputs Reviewed

- **Code paths reviewed**:
  - `src/modules/auth/infrastructure/drizzle/schema.ts`
  - `src/core/db/schema/references.ts`
  - `src/core/db/migrations/`
  - `src/app/api/auth/signup/route.ts`
  - `src/app/auth/signin/page.tsx` + `sign-in-client.tsx`
  - `src/app/auth/signup/page.tsx`
  - `src/security/middleware/route-policy.ts`
- **Earlier task artifacts reviewed**: `02 - Security & Auth - Summary.md`

---

## Current-State Findings

### Module Placement: `password_reset_tokens` Table

The `userCredentialsTable` and `authUserIdentitiesTable` already live in
`src/modules/auth/infrastructure/drizzle/schema.ts`. The `password_reset_tokens` table is
unambiguously auth-domain data and belongs in that same schema file. It MUST reference
`usersReferenceTable` from `@/core/db/schema/references` for the FK (consistent with existing auth schema pattern).

### API Route Structure

Existing routes follow `src/app/api/auth/{action}/route.ts`. New routes:

- `POST /api/auth/forgot-password` → `src/app/api/auth/forgot-password/route.ts`
- `POST /api/auth/reset-password` → `src/app/api/auth/reset-password/route.ts`

These are consistent with the existing `signup` and `set-password` route structure.
Both are already covered by `/api/auth` in `PUBLIC_ROUTE_PREFIXES` — no route-policy change needed.

### Page Structure

Existing pages follow `src/app/auth/{flow}/page.tsx` + `{flow}-client.tsx`. New/modified pages:

- `/auth/forgot-password/page.tsx` — replace placeholder with email form (modify existing)
- `/auth/forgot-password/forgot-password-client.tsx` — new client component
- `/auth/reset-password/page.tsx` — new page; reads `token` from searchParams
- `/auth/reset-password/reset-password-client.tsx` — new client component

### Sign-in UX: "Forgot password?" Link

The link must be **always visible** on the sign-in form — below the password field label, as a
secondary link alongside the field, matching the universal convention used by every major auth
provider. It must NOT depend on a failed sign-in attempt or a specific error code.

The `NoCredentials` error-code-specific link in the current sign-in client should be removed in
favor of the always-visible "Forgot password?" link.

### Files to Remove (CRITICAL)

- `src/app/api/auth/set-password/route.ts`
- `src/app/auth/set-password/page.tsx`
- `src/app/auth/set-password/set-password-client.tsx`
- Route-policy entries for `/auth/set-password` (added in Phase 1)

---

## Boundary And Dependency Assessment

### `password_reset_tokens` table

- **Owner**: `src/modules/auth/infrastructure/drizzle/schema.ts`
- **Dependency direction**: auth module → core/db (same as `userCredentialsTable`)
- **No cross-module coupling**: token table is only accessed by auth API routes

### Forgot-password / reset-password API routes

- **Runtime**: Node (not Edge) — bcrypt is Node-only; token hashing requires `crypto`
- **DI**: Both routes use `getAppContainer().resolve(INFRASTRUCTURE.DB)` — same pattern as signup
- **No new contracts needed**: These are direct route handlers, not domain services

### Auth Service Layer

The password reset logic (token generation, validation, password update) is simple enough to
implement directly in route handlers for Phase 2. A dedicated domain service can be extracted
later if the auth module grows. Premature abstraction is not warranted here.

---

## Architectural Decisions / Constraints

### Approved Architectural Constraints

1. **Token table**: `password_reset_tokens` in `src/modules/auth/infrastructure/drizzle/schema.ts`
2. **Route pattern**: `src/app/api/auth/{action}/route.ts` for all auth API endpoints
3. **Page pattern**: `src/app/auth/{flow}/page.tsx` + `{flow}-client.tsx`
4. **"Forgot password?" link**: Always-visible in sign-in form, below password field
5. **Remove set-password completely**: No patching, full removal
6. **Development mode token**: Raw token returned in response body when `NODE_ENV=development` only
7. **Drizzle migration**: New table requires a new migration file via `pnpm db:generate`

### Rejected Directions

1. **Separate "auth domain service" layer for Phase 2**: Premature; implement directly in route handlers
2. **Keeping set-password with added rate limiting**: Categorically rejected (Security Agent ruling)
3. **Putting `password_reset_tokens` in `src/core/db/`**: It is auth-domain data, not core infrastructure

### Follow-up Architectural Guardrails

- When email infrastructure is added, the email-sending call belongs in a separate adapter
  (`src/modules/auth/infrastructure/email/`) following the existing adapter pattern
- Token cleanup (expired/used rows) should be handled at the route level (delete on read) in Phase 2,
  with a background job option when task scheduling is available

---

## Open Questions / Blockers

- None blocking Phase 2 implementation
- Email sending is out of scope (deferred); dev-mode token return is the interim solution

---

## Handoff Notes

- **Runtime Agent must**: Confirm `await connection()` placement for new routes/pages; confirm no
  Edge-vs-Node conflicts; review `searchParams` usage in reset-password page
- **Do not re-decide**: Module placement, route structure, page structure, set-password removal
- **Next specialist**: Next.js Runtime Agent

---

## Update Log

### 2026-04-21 — Phase 2 Architecture Review

- Trigger: Phase 1 set-password removal + proper reset flow design
- Summary: Full architecture design documented; module placement confirmed; removal scope identified
- Sections refreshed: All
