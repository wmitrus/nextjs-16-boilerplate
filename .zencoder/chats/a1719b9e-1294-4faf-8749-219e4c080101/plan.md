# Phase 7.1 — AuthJS Provider Migration Flow & UX Hardening

**Task ID**: `a1719b9e-1294-4faf-8749-219e4c080101`
**Parent task**: Phase 7 AuthJS Adapter (`ee6b69a0-279b-4ec3-99ac-faf81d99e903`)
**Status**: Complete
**Date**: 2026-04-21

---

## Objective

Harden the AuthJS authentication UX and implement a safe provider-migration path so that users
previously provisioned via Clerk can transition to credential-based sign-in without requiring
email-sending infrastructure.

---

## Architectural Decisions (Orchestrator / Senior Architect)

### Decision A — Sign-up duplicate email

The API already returns `409 { error: 'An account with this email already exists' }`. The UI must
add contextual guidance: "If you previously signed in with a social provider, please sign in and
set a password." with a "Sign in instead →" link. The API message stays as-is.

### Decision B — Sign-in for Clerk-migrated users (email exists, no credentials)

The `authorize()` function in `auth.ts` currently returns `null` for both "wrong password" AND
"no credentials row". This must be split:

- If email found in `users` but NOT in `user_credentials` → `throw new Error('NoCredentials')`
  (NextAuth v4 surfaces the thrown error message as `result.error` when `redirect: false`)
- If wrong password → return `null` (NextAuth maps this to `CredentialsSignin`)
- `sign-in-client.tsx`: map `NoCredentials` to a professional message + link to `/auth/set-password`

### Decision C — Set Password flow (migration aid, no email required)

New route: `POST /api/auth/set-password`
New page: `/auth/set-password`

- Accepts: email + new password + confirm password
- Checks: user exists in `users` table
- Checks: user has NO `user_credentials` row (migration-only path — cannot overwrite existing passwords)
- If both pass: creates `user_credentials` entry + ensures `auth_user_identities(provider='authjs')` exists
- If user already has credentials: return `409 { error: 'This account already has a password. Use forgot password to reset it.' }`
- If no user: return `404 { error: 'No account found with this email address.' }`
- Security rationale: only allows set, never overwrite — harmless for accounts with no credentials,
  safe for Clerk-provisioned users, not exploitable for account takeover

### Decision D — Forgot Password (deferred, no email yet)

Add a placeholder `/auth/forgot-password` page with:

- A clear "Password reset via email is coming soon" message
- Guidance to use `/auth/set-password` if migrating from a social provider
- Full token-based flow deferred until email infrastructure (SMTP/SendGrid) is available

### Decision E — Registration Mode gate on API route

`/api/auth/signup` (route handler) must check `env.REGISTRATION_MODE !== 'open'` and return
`403 { error: 'Registration is currently closed.' }` — matching the page-level gate already in place.

### Decision F — Remove dev-mode DB error leakage from signup

The catch block in `/api/auth/signup` exposes `error.message` in `NODE_ENV=development`. This is
bad practice: it leaks DB constraint details. Replace with: detect Postgres unique constraint
violations (error code `23505`) and re-map to 409 in the catch block as a safety net. Otherwise
return the generic `'Failed to create account'` message (no DB detail in any mode).

---

## Scope Boundaries

**In scope:**

- `/api/auth/signup` route handler (gate + error leakage fix)
- `/api/auth/set-password` new route handler
- `/auth/set-password` new page + client component
- `/auth/forgot-password` placeholder page
- `auth.ts` — `authorize()` function (NoCredentials throw)
- `sign-in-client.tsx` — error message map update + set-password link
- `sign-up-client.tsx` — UX guidance on 409

**Out of scope (deferred):**

- Full email-based forgot password (requires SMTP/email service)
- Google OAuth integration
- E2E Playwright spec (carry-over from Phase 7 deferral)
- DB reset — user performs manually after implementation is complete

---

## Workflow Steps

### [x] Step 1 — Implementation: signup error leakage fix + REGISTRATION_MODE gate

**Agent**: Implementation Agent
**Files**:

- `src/app/api/auth/signup/route.ts`
  - Remove dev-mode `error.message` exposure from catch block
  - Detect `23505` unique constraint violation → re-map to 409 as safety net
  - Add `REGISTRATION_MODE !== 'open'` gate (403 response) before the rest of the logic
- `src/app/auth/signup/sign-up-client.tsx`
  - When API returns 409: show professional message with "Sign in instead →" link to `/auth/signin`
  - When API returns 403: show "Registration is currently closed." message

### [x] Step 2 — Implementation: authorize() NoCredentials distinction + sign-in UX

**Agent**: Implementation Agent
**Files**:

- `src/modules/auth/infrastructure/authjs/auth.ts`
  - In `authorize()`: when `user_credentials` row absent for the given email, query `users` table
    to check if a user exists — if yes, `throw new Error('NoCredentials')`; if no, return `null`
- `src/app/auth/signin/sign-in-client.tsx`
  - Add `NoCredentials` entry to `ERROR_MESSAGES` map:
    "This account was created with a different sign-in method. Please set a password to continue."
  - Render a "Set password →" link to `/auth/set-password` alongside the `NoCredentials` error

### [x] Step 3 — Implementation: Set Password page + API

**Agent**: Implementation Agent
**Files**:

- `src/app/api/auth/set-password/route.ts` (new)
  - POST handler; inputs: email + password (min 8 chars)
  - Guard: `AUTH_PROVIDER !== 'authjs'` → 404
  - Check user exists → 404 if not
  - Check no `user_credentials` row → 409 if exists
  - Insert `user_credentials` + ensure `auth_user_identities(provider='authjs')` exists
  - Return 201 on success
- `src/app/auth/set-password/page.tsx` (new)
  - Same layout pattern as signup page; shows form when `AUTH_PROVIDER=authjs`
  - Server component; guards for auth provider; redirects if already signed in
- `src/app/auth/set-password/set-password-client.tsx` (new)
  - Client form: email + password + confirm password
  - On 201: success message + redirect to `/auth/signin`
  - On 409: "This account already has a password. Please use forgot password."
  - On 404: "No account found with this email address."

### [x] Step 4 — Implementation: Forgot Password placeholder

**Agent**: Implementation Agent
**Files**:

- `src/app/auth/forgot-password/page.tsx` (new)
  - Static server component
  - Shows: "Password reset via email is not yet available."
  - Shows: "If you're migrating from a social sign-in, use Set Password instead." + link
  - No form, no API

### [x] Step 5 — Update route-policy for new routes

**Agent**: Implementation Agent
**Files**:

- `src/security/middleware/route-policy.ts`
  - Ensure `/auth/set-password` and `/auth/forgot-password` are treated as public auth routes
    (same as `/auth/signin` and `/auth/signup`)
  - Verify `/api/auth/set-password` is accessible without session (public API for migration)

### [x] Step 6 — Validation

**Agent**: Implementation Agent (inline validation)
**Commands**:

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```

- All 1059 existing tests must still pass
- New API routes and components must be covered by unit tests
- Coverage thresholds must be maintained

---

## Pause Points

**Pause after Step 3** — User should review the set-password UI design and API logic before
continuing to validation. The migration flow is the critical path; the orchestrator must wait for
user confirmation before proceeding.

---

## DB Reset (User-Performed, After Implementation)

After all steps are complete and validated:

```shell
pnpm db:dev:reset && pnpm db:dev:migrate
```

This clears Clerk-provisioned rows so the full authjs sign-up → sign-in → sign-out flow can be
tested from a clean state.

---

## Residual Work (Not In This Plan)

| Item                                                                         | Status                                |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| E2E Playwright spec for `/auth/signin`, `/auth/signup`, `/auth/set-password` | Deferred                              |
| Full forgot-password email flow                                              | Deferred (needs email infrastructure) |
| Google OAuth integration                                                     | Out of scope for Phase 7.x            |
| User-facing credential-linking for existing OAuth accounts                   | Out of scope for Phase 7.x            |

---

## Phase 2 — Proper Password Reset Design (Production-Ready)

**Status**: In Progress
**Date opened**: 2026-04-21
**Trigger**: Phase 1 set-password implementation was flagged as CRITICALLY INSECURE and non-standard UX.
**Issues**:

- CRITICAL SEC: `/api/auth/set-password` allows any caller who knows a valid email to set a password with zero identity verification → full account takeover. MUST be removed.
- UX: "Forgot password?" link must be permanently visible on the sign-in form, not only surfaced after a `NoCredentials` error.

**Workflow**: Design-first. All specialist agents must complete their reviews and produce artifacts before any implementation.

### [x] Phase 2 Step 1 — Security Review

**Agent**: Security & Auth Agent
**Scope**:

- Formally audit the insecure `set-password` endpoint and document it as a CRITICAL finding
- Define what a safe password-reset flow requires (token, expiry, single-use, email verification)
- Define whether a "no email" migration path is acceptable at all, and under what constraints
- Identify all other auth-surface risks introduced in Phase 1
  **Output artifact**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/02 - Security & Auth - Summary.md`

### [x] Phase 2 Step 2 — Architecture Review

**Agent**: Architecture Guard Agent
**Scope**:

- Design the proper password-reset flow (token storage, DB schema, API routes, page structure)
- Review module boundaries for `password_reset_tokens` — where does it live? (`auth` module)
- Determine whether the forgot-password/reset-password routes belong in `src/app/auth/` or need a separate module entry
- Confirm that the `NoCredentials` error flow (throw from authorize) is the correct pattern for NextAuth v4
- Review sign-in UX pattern: "Forgot password?" link should always be visible
  **Output artifact**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/01 - Architecture Guard - Summary.md`

### [x] Phase 2 Step 3 — Runtime Review

**Agent**: Next.js Runtime Agent
**Scope**:

- Review the new auth route handlers (`set-password`, `forgot-password`) for runtime placement
- Confirm `await connection()` usage is correct in all new server components and route handlers
- Review token-based reset flow: is it safe at Node runtime? Are there caching pitfalls?
- Confirm the Suspense boundary pattern is correct for the new pages
  **Output artifact**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/03 - Next.js Runtime - Summary.md`

### [x] Phase 2 Step 4 — Constraints Consolidation

**Agent**: Orchestrator
**Scope**: Consolidate Phase 2 specialist findings into constraints doc
**Output artifact**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/phase2-constraints.md`

### [x] Phase 2 Step 5 — Implementation Plan

**Agent**: Orchestrator
**Scope**: Produce step-by-step implementation plan covering:

- Immediate rollback: remove insecure set-password endpoint + page
- UX fix: always-visible "Forgot password?" link on sign-in
- DB schema: `password_reset_tokens` table (Drizzle migration)
- API: `POST /api/auth/forgot-password` — accepts email, generates token, stores hash, (sends email or returns token in dev)
- API: `POST /api/auth/reset-password` — validates token, sets new password, invalidates token
- Pages: `/auth/forgot-password` (email form), `/auth/reset-password` (password form)
- UX: success/error states for each step
- Sign-in page: "Forgot password?" link always visible below password field
  **Output artifact**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/phase2-implementation-plan.md`

**⛔ PAUSE HERE — user must review implementation plan before implementation begins.**

### [x] Phase 2 Step 6 — Implementation

**Agent**: Implementation Agent
**Prerequisite**: User approval of phase2-implementation-plan.md

### [x] Phase 2 Step 7 — Validation

**Commands**: `pnpm typecheck && pnpm lint --fix && pnpm test`
**Output artifact**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/phase2-validation-report.md`
