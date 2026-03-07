# Final Auth, Authorization and Provisioning Design

## 1. Purpose

This document defines the final production target for authentication, provisioning, onboarding, tenancy, and authorization in this boilerplate.

It is normative.

If current runtime behavior differs from this document, implementation must be updated to match this design.

## 2. Decision Summary

The final design is:

1. Edge is responsible only for session presence, request classification, internal API guard, rate limit, and security headers.
2. Node is the only authority for internal identity readiness, provisioning readiness, onboarding completion, tenant resolution, membership checks, and resource authorization.
3. Provisioning is not onboarding.
4. First authenticated entry must pass through a dedicated Node bootstrap flow before the app treats the user as an internal application user.
5. Onboarding is a domain step that enriches an already provisioned internal user.
6. Protected pages, protected APIs, and secure server actions must check internal readiness on every request.
7. Clerk is an external identity provider, not the source of truth for internal UUIDs, roles, tenant membership, or authorization.
8. Authorization decisions are based only on internal DB state and versioned internal policies.

## 3. Non-Negotiable Security Invariants

These invariants define production readiness.

### 3.1 Identity

- External session presence does not imply internal user existence.
- Internal application identity must be represented by an internal UUID stored in the database.
- External provider identifiers must never be used as domain user IDs in Node paths.
- Provider claims are input to provisioning only. They are not the final source of truth for app authorization.

### 3.2 Provisioning

- Provisioning must be idempotent.
- Provisioning must be safe under concurrent first-login requests.
- Provisioning must not run in Edge.
- Provisioning must be allowed only from explicit Node write paths.
- Read paths must never create users, tenants, memberships, roles, or policies.

### 3.3 Onboarding

- Onboarding is not the only provisioning trigger.
- Onboarding may defensively call `ensureProvisioned()` idempotently, but it cannot be the primary bootstrap path.
- A user without internal provisioning must not be treated as an onboarded or app-ready user.

### 3.4 Authorization

- Resource authorization must run only after internal identity and tenant context are resolved.
- Roles are internal and canonical: `owner`, `member`.
- Policies are explicit, versioned, and stored internally.
- No authorization decision may depend directly on Clerk role strings or session metadata.

### 3.5 Tenancy

- `AUTH_PROVIDER` and `TENANCY_MODE` are orthogonal.
- `TENANCY_MODE=single|personal|org` defines tenant behavior.
- `TENANT_CONTEXT_SOURCE=provider|db` defines where tenant context is read in `org` mode.
- Single-tenant mode must fail fast if `DEFAULT_TENANT_ID` does not exist.

## 4. Final Runtime Model

### 4.1 Route Classes

The app must distinguish these route categories:

- public marketing routes
- auth routes
- bootstrap route
- onboarding route
- protected application routes
- protected application APIs
- internal APIs

Recommended shape:

- public: `/`, `/pricing`, `/waitlist`
- auth: `/sign-in`, `/sign-up`
- bootstrap: `/auth/bootstrap`
- onboarding: `/onboarding`
- app: `/app` or `/users` or another dedicated protected prefix

Production rule:

- Clerk sign-in and sign-up must not redirect to `/`.
- Clerk sign-in and sign-up must redirect to `/auth/bootstrap`.

Clerk-specific decision:

- both sign-in and sign-up must be configured to terminate at `/auth/bootstrap`
- production-safe default is to use force redirect for both flows
- reason: with OAuth and social connections, "sign-in" can create a brand-new account, so sign-in cannot be treated as a returning-user-only path

This avoids the ambiguous state where a user is externally authenticated but lands on a public page that does not force internal readiness.

### 4.2 Edge Responsibilities

Edge middleware is intentionally narrow:

- request classification
- internal API guard
- rate limit
- security headers
- external session presence gate

Edge must not:

- read onboarding completion from DB
- resolve internal UUIDs
- resolve tenant membership from DB
- call provisioning writes
- run resource-level authorization

### 4.3 Node Responsibilities

Node is authoritative for:

- raw identity read from `AUTH.IDENTITY_SOURCE`
- internal identity resolution
- bootstrap provisioning
- onboarding completion check
- tenant resolution
- tenant membership validation
- authorization

## 5. Final Flow

### 5.1 First Login Flow

Authoritative first-login flow:

1. User signs in with Clerk.
2. Clerk redirects to `/auth/bootstrap`.
3. `/auth/bootstrap` runs in Node.
4. Bootstrap reads raw provider claims through `AUTH.IDENTITY_SOURCE`.
5. Bootstrap calls `PROVISIONING.SERVICE.ensureProvisioned(...)`.
6. Bootstrap resolves internal user and tenant state.
7. If onboarding is incomplete, redirect to `/onboarding`.
8. If onboarding is complete, redirect to requested protected route.

This route is the primary write-side bootstrap entrypoint.

Redirect handling rule:

- `/auth/bootstrap` owns post-auth routing
- Clerk must not decide whether the user goes to marketing, onboarding, or app surfaces after authentication
- if the app needs deep-link preservation, it must persist a safe internal redirect target and let `/auth/bootstrap` apply it after successful bootstrap

Recommended Clerk env policy:

- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/auth/bootstrap`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/bootstrap`

Optional advanced variant:

- fallback redirect values may still exist for defensive completeness
- if force redirects are relaxed in a future app, the invariant remains the same: every authenticated path must still resolve through `/auth/bootstrap` before protected app access

### 5.2 Returning Session Flow

On later sessions:

1. User hits a protected route or protected API.
2. Node access gate resolves internal identity and tenant context.
3. If internal identity is missing unexpectedly, redirect to `/auth/bootstrap`.
4. If onboarding is incomplete, redirect to `/onboarding`.
5. If tenant context or membership is invalid, return controlled denial.
6. If all checks pass, resource authorization runs.

Final gate decision:

- `BOOTSTRAP_REQUIRED` on protected pages must redirect to `/auth/bootstrap`
- `BOOTSTRAP_REQUIRED` on protected APIs must return a controlled `409` response with code `BOOTSTRAP_REQUIRED`
- do not return `401` for `BOOTSTRAP_REQUIRED`
- do not redirect to sign-in for `BOOTSTRAP_REQUIRED`

Reason:

- external authentication already succeeded
- the missing piece is internal bootstrap, not authentication
- collapsing this into `401` weakens observability and creates unnecessary re-auth loops

### 5.3 Public Route Flow

Public routes may render for:

- signed-out visitors
- signed-in users
- signed-in but not yet bootstrapped users

This is acceptable only if:

- no protected data is read
- no internal user assumptions are made
- no app-only actions are enabled

Public shell may show "signed in" from Clerk UI. That is not a security issue by itself. It is only a UX concern. The protected app surface remains the real security boundary.

However, post-auth completion must still converge through bootstrap.

Production rule:

- a newly authenticated user must never rely on a public route visit to become provisioned
- provisioning bootstrap is an explicit Node flow, not an incidental side effect of browsing

## 6. Required New Canonical State Model

The Node access layer must distinguish these states explicitly:

- `UNAUTHENTICATED`
- `BOOTSTRAP_REQUIRED`
- `ONBOARDING_REQUIRED`
- `TENANT_CONTEXT_REQUIRED`
- `TENANT_MEMBERSHIP_REQUIRED`
- `FORBIDDEN`
- `ALLOWED`

This is more correct than collapsing "user not provisioned" and "onboarding incomplete" into one state.

Required mapping:

- no external session -> `UNAUTHENTICATED`
- external session exists but no internal user or no mapping -> `BOOTSTRAP_REQUIRED`
- internal user exists but `onboardingComplete=false` -> `ONBOARDING_REQUIRED`
- tenant missing or default tenant missing -> `TENANT_CONTEXT_REQUIRED`
- tenant exists but membership required and absent -> `TENANT_MEMBERSHIP_REQUIRED`
- authz deny after valid internal context -> `FORBIDDEN`

## 7. Module Responsibilities

### 7.1 Auth Module

Auth module responsibilities:

- expose `AUTH.IDENTITY_SOURCE` for raw external claims
- expose `AUTH.IDENTITY_PROVIDER` for internal identity resolution
- expose `AUTH.TENANT_RESOLVER` for tenant resolution
- expose `AUTH.USER_REPOSITORY`

Auth module must not:

- create users on read paths
- write memberships
- write policy templates
- import feature/domain logic

### 7.2 Provisioning Module

Provisioning module responsibilities:

- resolve or create internal user
- resolve or create tenant when allowed by mode
- create external-to-internal mappings
- create initial membership when allowed by mode
- apply role + policy template versioning
- enforce cross-provider linking rules
- enforce tenant user limit rules

Provisioning is the only write path for identity mapping creation.

### 7.3 Authorization Module

Authorization module responsibilities:

- resolve internal roles and policies
- evaluate route and resource actions
- enforce ABAC conditions

Authorization module must assume:

- internal user identity already exists
- tenant context is already valid

### 7.4 Security Layer

Security layer responsibilities:

- orchestrate Edge middleware
- build Node access gate
- map domain errors to redirects or HTTP status codes
- wrap server actions and APIs

Security layer must not:

- implement provider-specific logic outside the adapter boundary
- own provisioning business rules
- own policy templates

## 8. Final Provisioning Design

### 8.1 Bootstrap Route

Add a dedicated Node route or page:

- `/auth/bootstrap`

Required behavior:

1. Read safe redirect target from query.
2. Resolve raw external claims.
3. If no external session, redirect to sign-in.
4. Call `ensureProvisioned(...)`.
5. If provisioning fails due to policy or config, render controlled failure page or redirect to a controlled error route.
6. If user profile is incomplete, redirect to `/onboarding`.
7. Else redirect to requested protected target.

Final decision for bootstrap failures:

- `/auth/bootstrap` must render the controlled error UI itself
- do not redirect back to sign-in for provisioning failures
- do not make sign-in responsible for provisioning failure UX

Reason:

- authentication already succeeded
- the failure is in internal readiness, policy, or tenant setup
- redirecting to sign-in hides the real problem and encourages loops

Failure categories that `/auth/bootstrap` must distinguish:

1. policy failure
   - example: cross-provider linking blocked
   - UX: explain that the user must use the original provider or contact support
2. quota failure
   - example: tenant free-tier user limit reached
   - UX: explain that tenant capacity is exhausted
3. tenant/config failure
   - example: missing `DEFAULT_TENANT_ID`, invalid tenant context source, broken tenant mapping
   - UX: controlled internal error page with correlation ID, retry, and sign-out action

Minimum bootstrap error UI actions:

- `Retry`
- `Sign out`
- optional `Contact support`

### 8.2 Onboarding Action

`completeOnboarding()` must:

1. defensively call `ensureProvisioned()` again
2. save profile fields using internal user UUID
3. set `onboardingComplete=true`
4. never write tenant or authorization state outside provisioning service

Boilerplate rule for onboarding fields:

- auth/onboarding module must not require product-specific domain fields to complete account readiness
- the current fields `targetLanguage`, `proficiencyLevel`, and `learningGoal` are application-specific placeholders, not valid boilerplate auth-domain fields
- final boilerplate onboarding should use minimal generic profile data only, for example:
  - `displayName`
  - optional `avatarUrl`
  - optional locale/timezone
- product-specific onboarding belongs in separate feature modules after base account readiness

Final decision:

- replace current language-learning fields in the boilerplate path
- do not let domain-specific profile questions block core onboarding completion in the reusable template

This keeps onboarding idempotent and resilient if the user reaches it from an unusual flow.

### 8.3 Webhooks

Clerk webhooks are optional optimization only.

They may be used for:

- async pre-warming user records
- cleanup on `user.deleted`
- telemetry

They must not be required for correctness.

The application must remain correct if webhooks are delayed, disabled, or replayed.

### 8.4 Provider Metadata

Do not require internal UUIDs in Clerk metadata for correctness.

Optional provider metadata may exist as a cache hint, but:

- DB remains authoritative
- provisioning must work without that metadata
- provider switch must not require rewriting internal auth model

## 9. Final Tenancy Rules

### 9.1 Single

- tenant is `DEFAULT_TENANT_ID`
- bootstrap must assert tenant exists
- protected requests must assert tenant exists
- missing default tenant is a controlled deployment/configuration error

### 9.2 Personal

- one tenant per user
- first bootstrap creates personal tenant deterministically
- user becomes `owner`

### 9.3 Org + Provider

- tenant comes from provider external org ID
- bootstrap maps external org to internal tenant
- first bootstrap may create tenant and membership if allowed by rules
- provider org role is only an input to initial membership role mapping

### 9.4 Org + DB

- active tenant comes from app-level selector, header, or cookie
- provisioning does not assume provider org support
- membership must already exist or be created via explicit invite/join flow
- protected requests validate active tenant membership on every request

## 10. Final Authorization Design

### 10.1 Order of Operations

Protected Node request order:

1. external session read
2. internal identity resolution
3. internal readiness check
4. tenant resolution
5. membership validation
6. authorization evaluation
7. handler execution

Authorization must never run before steps 2 to 5 are complete.

### 10.2 Role Source of Truth

The only source of truth for roles is internal DB membership and role assignment.

Provider roles may influence provisioning only for initial bootstrap in `org/provider`.

### 10.3 Policy Model

Policies must remain:

- explicit
- action-based
- versioned
- tenant-scoped
- free of wildcard resource/action strings

Policy template upgrades must be idempotent and test-covered.

## 11. Comparison to Reference Project

Reference analyzed:

- `https://github.com/WebDevSimplified/course-platform`

Useful lesson from that project:

- it does not wait for onboarding to sync the user into DB
- it forces a bootstrap-style sync when Clerk session exists but DB identity is absent

Why this boilerplate must not copy it literally:

- it stores internal `dbId` and `role` in Clerk metadata as a runtime dependency
- it is Clerk-specific
- it is not provider-orthogonal

Final decision:

- keep the bootstrap concept
- reject provider metadata as a correctness dependency
- keep DB as the only internal identity and authorization authority

## 12. Required Test Architecture

Testing must prove invariants, not only happy paths.

### 12.1 Unit Tests

Unit suite must cover:

- raw identity source mapping for Clerk/AuthJS/Supabase
- internal identity provider read-only behavior
- tenant resolver behavior per tenancy mode
- node access state machine:
  - unauthenticated
  - bootstrap required
  - onboarding required
  - tenant context required
  - tenant membership required
  - forbidden
  - allowed
- bootstrap orchestrator redirect mapping
- secure action wrappers
- API wrapper status/code mapping
- no write side effects in read paths

### 12.2 Integration Tests

Integration suite must cover:

- `/auth/bootstrap` behavior for every access state
- protected layout redirect behavior
- protected API behavior
- onboarding page accessibility for unbootstrapped authenticated users
- public route behavior with active external session but no internal user
- `/api/me/provisioning-status` as authoritative runtime probe

### 12.3 DB Integration Tests

DB suite must cover:

- first bootstrap creates expected records
- idempotent re-bootstrap
- canonical mapping re-read after conflicts
- deterministic tenant ID behavior
- policy template version upgrades
- role template correctness
- cross-provider linking policy
- free-tier tenant limit
- single-tenant missing default tenant
- `org/db` membership required path
- no role escalation on repeated provisioning
- no orphaned tenant or mapping rows under races

### 12.4 E2E Tests

E2E must run against:

- Clerk test keys
- local Podman/Postgres
- seeded or controlled Clerk test users
- scripted or documented Clerk test fixture setup

Mandatory scenarios:

1. `single`
2. `personal`
3. `org/provider`
4. `org/db`

Mandatory positive paths:

- first login -> bootstrap -> onboarding -> app
- returning login -> bootstrap skipped -> app
- protected API succeeds after readiness
- OAuth entry from sign-in page that creates a brand-new user still lands on `/auth/bootstrap`
- OAuth entry from sign-up page lands on `/auth/bootstrap`

Mandatory negative paths:

- active Clerk session + DB reset -> bootstrap required
- missing default tenant -> controlled failure
- org/provider without active org -> tenant context required
- org/db without active tenant cookie/header -> tenant context required
- org/db with active tenant but no membership -> 403
- provisioning blocked by cross-provider email linking policy
- free-tier user limit reached
- provisioning failure renders controlled bootstrap error UI and does not bounce to sign-in

Mandatory Clerk redirect tests:

- sign-in force redirect points to bootstrap
- sign-up force redirect points to bootstrap
- switching from sign-in to sign-up within Clerk UI still ends at bootstrap
- switching from sign-up to sign-in within Clerk UI still ends at bootstrap

### 12.5 Test Data Model

Maintain dedicated E2E identities:

- `clerk_single_new_user`
- `clerk_single_provisioned_user`
- `clerk_personal_new_user`
- `clerk_org_owner`
- `clerk_org_member`
- `clerk_org_non_member`
- `clerk_unverified_email_user`

For `org/provider`, maintain dedicated Clerk organizations:

- `e2e-org-owner`
- `e2e-org-member`
- `e2e-org-empty`

For `org/db`, maintain DB fixtures for:

- tenant
- membership
- active tenant cookie/header

Maintain explicit Clerk flow fixtures:

- password sign-in existing user
- OAuth sign-in existing user
- OAuth sign-in brand-new user
- sign-up brand-new user

Current repo status:

- the repository currently exposes env vars for one standard Clerk E2E user and one unprovisioned Clerk E2E user
- that is not enough for the final matrix
- full Clerk E2E fixture inventory is not yet provisioned as a managed, repeatable test setup

Final decision:

- do not downgrade or skip E2E
- create setup documentation and, where feasible, setup scripts for Clerk test users and org fixtures
- release readiness requires the full matrix, not just unit and integration coverage

Minimum deliverables for Clerk E2E fixture management:

1. documented list of required Clerk users
2. documented list of required Clerk organizations
3. env var contract for each identity used by Playwright
4. reset procedure for local DB vs persistent Clerk identities
5. optional helper scripts for fixture verification and smoke checks

## 13. Required Implementation Plan

### Phase 1

- add `/auth/bootstrap`
- change Clerk redirect env defaults to bootstrap route for both sign-in and sign-up
- introduce explicit `BOOTSTRAP_REQUIRED` state
- add controlled bootstrap error UI

### Phase 2

- update Node gate wrappers and protected layouts to use bootstrap state
- keep onboarding as profile completion step, not primary bootstrap
- preserve safe post-bootstrap redirect target

### Phase 3

- harden test matrix across unit, integration, DB, and E2E
- remove any test that proves only public-session presence without internal readiness semantics
- replace product-specific onboarding fields in auth-domain tests with generic profile completion fixtures
- add Clerk fixture management docs/scripts for the full E2E matrix

### Phase 4

- optional Clerk webhook support for async sync and cleanup
- must remain non-authoritative

## 14. Release Acceptance Gates

The auth/authz stack is production-ready only if all conditions hold:

1. `pnpm typecheck` passes.
2. `pnpm lint` passes.
3. `pnpm test` passes.
4. `pnpm test:integration` passes.
5. `pnpm test:db` passes.
6. targeted E2E matrix passes for `single`, `personal`, `org/provider`, `org/db`.
7. active external session with empty DB cannot access any protected page or protected API.
8. first login always flows through bootstrap before app access.
9. onboarding is never the only provisioning trigger.
10. DB remains the only source of truth for internal identity, tenant membership, and authorization.

## 15. Final Verdict

The current architecture direction is correct after the Node-authoritative hardening, but the final production design still requires one more structural step:

- introduce explicit bootstrap provisioning before onboarding

Without that step, the system is hardened but not fully polished as a production-grade first-login flow.

With that step implemented, the design is valid for a production-ready modular monolith and remains compatible with future `authjs` and `supabase` adapters.
