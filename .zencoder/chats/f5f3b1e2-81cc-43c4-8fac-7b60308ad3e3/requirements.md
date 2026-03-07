# Product Requirements Document

## Auth, Authorization & Provisioning — Production Hardening

**Based on:** `docs/feature-desings/01 - Final Auth, Authorization and Provisioning Design.md`  
**Audit Reference:** `docs/audits/2026-03-07-runtime-provisioning-root-cause-audit.md`

---

## 1. Problem Statement

The current authentication architecture has critical gaps that prevent production readiness:

1. **No `/auth/bootstrap` route** — first-login provisioning is triggered by onboarding form submission, not by a dedicated Node write path. An authenticated Clerk user can reach the app in an ambiguous "externally authenticated but internally unprovisioned" state.

2. **Missing `BOOTSTRAP_REQUIRED` state** — the Node access state machine conflates "no internal user record" with "onboarding not complete". These are distinct states requiring different handling.

3. **Onboarding is the primary provisioning trigger** — `completeOnboarding()` calls `ensureProvisioned()` as the first write path. The design mandates provisioning must happen BEFORE onboarding.

4. **Clerk redirect defaults bypass bootstrap** — sign-up redirects to `/onboarding`, sign-in falls back to `/`. Neither guarantees passing through the Node bootstrap write path.

5. **Domain-specific onboarding fields** — `targetLanguage`, `proficiencyLevel`, `learningGoal` are application domain fields, not generic profile fields. The boilerplate must use generic fields.

---

## 2. Functional Requirements

### FR-1: Bootstrap Route

- A dedicated Node.js server component page must exist at `/auth/bootstrap`.
- It must run exclusively in Node runtime (not Edge).
- On load, it must:
  1. Read `redirect_url` from query params (validated, restricted to internal paths only).
  2. Read raw provider claims via `AUTH.IDENTITY_SOURCE`.
  3. If no external session exists, redirect to `/sign-in`.
  4. Call `PROVISIONING.SERVICE.ensureProvisioned(...)` with full provider context.
  5. On provisioning policy failure (cross-provider linking, tenant limit, tenant config): render a controlled inline error UI on `/auth/bootstrap` (no redirect away; auth succeeded, internal bootstrap failed).
  6. If `onboardingComplete === false`, redirect to `/onboarding`.
  7. If `onboardingComplete === true`, redirect to `redirect_url` or `/users` as default.

### FR-2: `BOOTSTRAP_REQUIRED` State

- `NodeProvisioningAccessStatus` must include a distinct `BOOTSTRAP_REQUIRED` state.
- `BOOTSTRAP_REQUIRED` maps to: external session present + no internal user record found.
- `ONBOARDING_REQUIRED` maps to: internal user exists + `onboardingComplete === false`.
- These must not be collapsed into a single state.

### FR-3: Node Access Gate — Updated Redirect Mapping

- Protected pages (`/users`, etc.):
  - `UNAUTHENTICATED` → redirect `/sign-in`
  - `BOOTSTRAP_REQUIRED` → redirect `/auth/bootstrap`
  - `ONBOARDING_REQUIRED` → redirect `/onboarding`
  - `TENANT_CONTEXT_REQUIRED` → redirect `/onboarding?reason=tenant-context-required`
  - `TENANT_MEMBERSHIP_REQUIRED` → redirect `/`
  - `FORBIDDEN` → redirect `/`
- Protected APIs:
  - `BOOTSTRAP_REQUIRED` → 409 with `{ code: 'BOOTSTRAP_REQUIRED' }`
  - `ONBOARDING_REQUIRED` → 409 with `{ code: 'ONBOARDING_INCOMPLETE' }`

### FR-4: Clerk Redirect Configuration

- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` must default to `/auth/bootstrap`.
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` must default to `/auth/bootstrap`.
- Fallback redirects (`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`) must also default to `/auth/bootstrap`.
- This applies to all flows: password, OAuth, social — sign-in can also create a new OAuth user.

### FR-5: Onboarding Role Clarification

- `completeOnboarding()` may defensively call `ensureProvisioned()` (idempotent), but it must NOT be the primary provisioning path.
- Bootstrap route is the primary write path.
- Onboarding form collects generic profile fields: `displayName` (required), optional `locale`, optional `timezone`.
- Domain-specific fields (`targetLanguage`, `proficiencyLevel`, `learningGoal`) must be removed from the generic boilerplate template.
- `userRepository.updateProfile()` must accept `displayName`, `locale`, `timezone`.

### FR-6: Route Classification Update

- Edge middleware route classification must recognize `/auth/bootstrap` as a distinct bootstrap route (not a public route, not an auth route, not a protected app route).
- Bootstrap route must be accessible to externally authenticated users who have no internal record.
- Edge middleware must NOT gate the bootstrap route with internal provisioning checks.

### FR-7: Bootstrap Error UI

- When provisioning fails (policy/config/limit), the bootstrap page renders an inline error state with:
  - A clear human-readable error message (mapped from domain error type).
  - A "Try Again" retry mechanism.
  - A "Sign out" action (Clerk `signOut()`).
  - No sensitive internal details exposed in the UI.
- Error types to distinguish:
  - `CrossProviderLinkingNotAllowedError` — cross-provider policy blocked
  - `TenantUserLimitReachedError` — quota exceeded
  - `TenantContextRequiredError` / `TenantNotProvisionedError` — tenant/config error

### FR-8: API Probe Endpoint

- `/api/me/provisioning-status` must return deterministic outcomes for all 7 canonical states.
- `BOOTSTRAP_REQUIRED` must be a valid response state from this endpoint.

### FR-9: Generic Profile Fields

- The internal `User` model must support: `displayName`, `locale`, `timezone`, `onboardingComplete`.
- DB schema migration must add `display_name`, `locale`, `timezone` columns.
- `UserRepository.updateProfile()` must accept these generic fields.

---

## 3. Non-Functional Requirements

### NFR-1: Idempotency

- `ensureProvisioned()` must remain idempotent under concurrent requests.
- Bootstrap route must be safe to call multiple times for the same user.

### NFR-2: Security

- `redirect_url` on bootstrap route must be validated: only relative internal paths allowed; no open redirect.
- Bootstrap route must not expose internal error details to the UI.
- No write side effects on read paths (identity resolution, user repository lookup).

### NFR-3: Runtime Boundary

- Bootstrap route runs in Node.js runtime only.
- Edge middleware does not perform provisioning, internal DB lookups, or identity resolution beyond external session presence.

### NFR-4: Provider Orthogonality

- Implementation must work with `AUTH_PROVIDER=clerk|authjs|supabase`.
- No Clerk-specific logic may be used outside the Clerk adapter boundary.
- DB is the only source of truth for internal identity, tenant membership, and authorization.

---

## 4. Test Requirements

### Unit Tests (co-located with source)

- `node-provisioning-access.ts`: all 7 states covered, `BOOTSTRAP_REQUIRED` distinct from `ONBOARDING_REQUIRED`.
- Bootstrap action/server logic: each provisioning error type mapped to correct UI error message.
- `with-node-provisioning.ts`: `BOOTSTRAP_REQUIRED` returns 409 with correct code.
- Redirect safety validator: rejects external URLs, accepts internal paths.

### Integration Tests

- `/auth/bootstrap`: redirects to `/sign-in` with no session.
- `/auth/bootstrap`: calls `ensureProvisioned()` and redirects to `/onboarding` for new user.
- `/auth/bootstrap`: redirects to `/users` for already-provisioned-and-onboarded user.
- `/auth/bootstrap`: renders error UI for each provisioning failure type.
- Protected layout: `BOOTSTRAP_REQUIRED` → redirect to `/auth/bootstrap`.
- Protected API: `BOOTSTRAP_REQUIRED` → 409 with `BOOTSTRAP_REQUIRED` code.

### DB Integration Tests

- First bootstrap creates expected user, tenant, membership records.
- Idempotent re-bootstrap does not duplicate records.
- Policy template version upgrades are idempotent.

### E2E Tests

- Mandatory scenarios: `single`, `personal`, `org/provider`, `org/db`.
- First login → bootstrap → onboarding → app.
- Returning login → bootstrap → app (onboarding skipped).
- Active Clerk session + DB reset → bootstrap required.
- Missing default tenant → controlled error on bootstrap page.
- E2E Clerk test user fixture documentation and setup script required.

---

## 5. Out of Scope

- Clerk webhook implementation (Phase 4 per design; non-authoritative optimization only).
- Billing/subscription integration.
- Per-tenant feature flags.
- Multi-provider account linking UI.
