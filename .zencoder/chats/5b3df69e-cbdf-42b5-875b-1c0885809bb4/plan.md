# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/5b3df69e-cbdf-42b5-875b-1c0885809bb4/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/5b3df69e-cbdf-42b5-875b-1c0885809bb4/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/5b3df69e-cbdf-42b5-875b-1c0885809bb4/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/5b3df69e-cbdf-42b5-875b-1c0885809bb4/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

### [x] Task 0: PGlite as local/test database

**Decision**: Use `@electric-sql/pglite` as the offline development and integration test database.

**Rationale**:

- Real PostgreSQL compiled to WASM → 100% schema/migration/RLS compatible with production
- `drizzle-orm/pglite` adapter → same Drizzle schema runs on PGlite (dev/test) and any real PG (prod)
- Zero Docker/service dependency → works offline and in CI
- Will replace `MockRepositories` with real Drizzle-based repos in Prompt 02+ (DrizzleRepositories implementation phase)
- PGlite in-memory mode used for tests; filesystem mode for local dev

**Added to plan**: PGlite setup will be part of DrizzleRepositories implementation (future prompt). For this baseline prompt, MockRepositories remain.

---

### [x] Task 1: Normalize `ensureRequiredRole` in `authorization-facade.ts`

**File**: `src/security/core/authorization-facade.ts`  
**Layer**: `security` → uses `security/core` types only  
**Change**: Replace hard-coded `requiredRole === 'admin'` check with a numeric role hierarchy comparison so RBAC floor is deterministic for all role levels (guest < user < admin).

**Contract reference**: `UserRole` type from `security/core/security-context.ts`  
**Verification**: `pnpm test src/security/core/authorization-facade`

---

### [x] Task 2: Add security context role-mapping edge case tests

**File**: `src/security/core/security-context.test.ts`  
**Layer**: test for `security/core`  
**New test cases**:

- Multiple roles returned by `roleRepository` → admin wins (any 'admin' in array → role='admin')
- Empty roles array → defaults to 'user'
- Roles array with unknown value → defaults to 'user'

**Verification**: `pnpm test src/security/core/security-context`

---

### [x] Task 3: Expand authorization integration tests (tenant + role edge cases)

**File**: `src/testing/integration/authorization.integration.test.ts`  
**Layer**: integration test spanning `modules/authorization`  
**New test cases**:

- Tenant mismatch (subject is not a member of the requested tenant) → `can()` returns false
- Subject has membership → `can()` returns true for matching action/resource
- Unauthenticated context (empty subjectId) → `can()` returns false

**Verification**: `pnpm test src/testing/integration/authorization`

---

### [x] Task 4: Expand `with-auth` middleware tests for authorization denial paths

**File**: `src/security/middleware/with-auth.test.ts`  
**Layer**: test for `security/middleware`  
**New test cases**:

- Authenticated user, authorization returns `false` for private API route → 403 JSON response
- Authenticated user, authorization returns `false` for private page → redirect to `/`
- `authorization.authorize()` is called with correct `tenant` + `subject` structure (spy assertion)

**Verification**: `pnpm test src/security/middleware/with-auth`

---

### [x] Task 5: Expand server actions integration tests for role hierarchy + tenant combinations

**File**: `src/testing/integration/server-actions.test.ts`  
**Layer**: integration test spanning `security/actions`  
**New test cases**:

- Unauthenticated user, `role: 'guest'` required → unauthorized
- Authenticated user with role 'user', `role: 'admin'` required → unauthorized
- Authenticated user with role 'admin', `role: 'admin'` required → success
- Authenticated user in wrong tenant → denied by membership check (DefaultAuthorizationService)

**Verification**: `pnpm test src/testing/integration/server-actions`

---

### [x] Task 7: Strong RBAC typing — centralize UserRole, ROLES, ROLE_HIERARCHY in core/contracts

**Objective**: Make role types/constants defined once in `src/core/contracts/roles.ts`, importable everywhere without raw strings.

**Files**:

- NEW `src/core/contracts/roles.ts` — `UserRole`, `ROLES`, `ROLE_HIERARCHY`
- Update: `security-context.ts`, `authorization-facade.ts`, `secure-action.ts`, `security-context.mock.ts`, `secure-action.mock.ts`, `MockRepositories.ts`, `tests/setup.tsx`, all test files with raw role strings, `showcase-actions.ts`, `AdminOnlyExample.tsx`

**Verification**: `pnpm typecheck && pnpm test`

---

### [x] Task 8: RBAC documentation in docs/features/

**File**: `docs/features/01 - RBAC Baseline.md`  
**Content**: Implementation details, file catalog with purpose, Modular Monolith compliance proof, usage manual with examples.

---

### [x] Task 6: Full gate verification and compliance report

Run all quality gates and record results:

```bash
pnpm typecheck
pnpm skott:check:only
pnpm madge
pnpm depcheck
pnpm env:check
pnpm test
```

Run forbidden import scans:

```bash
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared || true
grep -RInE "from ['\"]@/(app|features|security)/" src/modules || true
grep -RInE "from ['\"]@/(app|features|modules)/" src/security || true
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core || true
```

Record results below.

---

## Gate Results

| Gate                    | Result                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`        | ✅ PASS                                                                 |
| `pnpm skott:check:only` | ✅ PASS                                                                 |
| `pnpm madge`            | ✅ PASS — No circular dependency found                                  |
| `pnpm depcheck`         | ✅ PASS — No depcheck issue                                             |
| `pnpm env:check`        | ✅ PASS — .env.example in sync                                          |
| `pnpm test`             | ✅ PASS — 343 passed (was 331, +12 new tests)                           |
| Forbidden import scans  | ✅ CLEAN — only composition-root exception in `core/container/index.ts` |

## RBAC Baseline Summary

### Changed files and layer mapping

| File                                                        | Layer            | Change                                                                                                      |
| ----------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/security/core/authorization-facade.ts`                 | `security`       | Normalized role hierarchy (guest=0, user=1, admin=2) — deterministic RBAC floor                             |
| `src/security/core/security-context.test.ts`                | test             | +4 tests: multi-role admin wins, empty roles, unknown roles, unauthenticated state                          |
| `src/testing/integration/authorization.integration.test.ts` | integration test | +5 tests: tenant mismatch, membership coverage, non-user subject, empty subject, no matching policy         |
| `src/security/middleware/with-auth.test.ts`                 | test             | +4 tests: 403 API denial, page redirect denial, tenant+subject structure assertion, 401 unauthenticated API |
| `src/testing/integration/server-actions.test.ts`            | integration test | +4 tests: admin role success, user>guest hierarchy, admin>user hierarchy, policy-level denial               |

### Compliance verdict: **PASS**

All layer boundaries preserved. No new contracts. No boundary violations. All gates pass.

### Ready for Prompt 01 ABAC: **YES**

The RBAC baseline is hardened:

- Role acquisition path is explicitly tested
- Auth ↔ Authorization handoff is contract-driven and verified
- Role enforcement is deterministic across middleware and secure actions
- Tenant + membership edge cases are covered

---

## Prompt 01 — ABAC Foundation

### Architecture understanding statement

Current state: `PolicyEngine` already supports `condition?` on `Policy`, `subject.attributes?` and `resource.attributes?` already exist in `AuthorizationContext`. **ABAC conditions already work at the domain level.**

What's missing:

1. `AuthorizationContext` lacks an explicit `environment?` field (ip, time, request-level data).
2. `secure-action.ts` and `with-auth.ts` don't pass `environment` data into `AuthorizationContext`.
3. `SecurityContext.user` has no `attributes?` for user metadata (plan, onboardingComplete, etc.).
4. No reusable ABAC condition helper library in `modules/authorization/domain/policy/`.
5. No ABAC tests demonstrating environment conditions.

Non-changes: `PolicyEngine`, `Policy.condition?`, DI container, role hierarchy, `roles.ts` location.

---

### [x] Task A1: Add `environment?` to `AuthorizationContext`

**File**: `src/core/contracts/authorization.ts`
**Change**: Add `readonly environment?: { readonly ip?: string; readonly time?: Date; readonly [key: string]: unknown }` field.
**Impact**: Additive only — all existing `AuthorizationContext` usages remain valid (field is optional).

---

### [x] Task A2: Add `attributes?` to `SecurityContext.user`

**File**: `src/security/core/security-context.ts`
**Change**: Add `attributes?: Record<string, unknown>` to `SecurityContext.user`. Leave it empty in `createSecurityContext` for now — to be populated from Drizzle UserRepository in future prompt.
**No new DI dependencies added.**

---

### [x] Task A3: Pass `environment` data in `secure-action.ts`

**File**: `src/security/actions/secure-action.ts`
**Change**: Add `environment: { ip: context.ip, time: new Date() }` to the `AuthorizationContext` passed to `authorization.authorize()`.
**Note**: Data assembly only — no ABAC logic here. Logic stays in `modules/authorization/domain`.

---

### [x] Task A4: Pass `environment` data in `with-auth.ts`

**File**: `src/security/middleware/with-auth.ts`
**Change**: Add `environment: { ip, time: new Date(), path, method }` to the `AuthorizationContext`.
**Note**: Data assembly only.

---

### [x] Task A5: Create `ConditionEvaluator.ts` in domain

**File**: `src/modules/authorization/domain/policy/ConditionEvaluator.ts`
**Layer**: `modules/authorization/domain` only — pure functions, no framework imports.
**Content**: Reusable ABAC condition builders: `isOwner`, `hasAttribute`, `isBeforeTime`, `isAfterTime`, `isFromIp`.

---

### [x] Task A6: Update `MockRepositories.ts` with ABAC policies

**File**: `src/modules/authorization/infrastructure/MockRepositories.ts`
**Change**: Add example ABAC policies that use `environment` and `subject.attributes` conditions.

---

### [x] Task A7: ABAC integration tests

**File**: `src/testing/integration/authorization.integration.test.ts`
**New test cases**:

- Environment IP condition: deny from blocked IP.
- Time-based condition: deny outside allowed window.
- Ownership condition: allow only resource owner.
- Attribute condition: allow only if subject has `plan: 'pro'`.

---

### [x] Task A8: Gate verification (Prompt 01)

Run and report: `pnpm typecheck`, `pnpm skott:check:only`, `pnpm madge`, `pnpm depcheck`, `pnpm env:check`, `pnpm test`, `pnpm test:integration`, forbidden import scans.

---

### [x] Task A9: ABAC documentation in docs/features/

**File**: `docs/features/23 - ABAC Foundation.md`
**Content**: Implementation details, file catalog with purpose, Modular Monolith compliance proof, usage manual with examples.

---

## Enterprise Readiness Refactor — Billing / Multi-Tenant / Feature Flags Foundation

### [x] Task RF1: Add `TenantAttributes` + extend `AuthorizationContext`

**File**: `src/core/contracts/authorization.ts`
**Changes**:

- Added `TenantAttributes` interface (plan, subscriptionStatus, features, contractType, userLimit)
- Added `roles?: readonly string[]` to `SubjectContext` (tenant-scoped raw roles from DB)
- Added `userAgent?` to `EnvironmentContext`
- Changed `AuthorizationContext.tenant` from `TenantContext` to `{ readonly tenantId: TenantId }` (removes redundant userId; subject.id already carries it)
- Added `tenantAttributes?: TenantAttributes` to `AuthorizationContext` (populated by service, NOT enforcement layer)

### [x] Task RF2: Add `TenantAttributesRepository` to `core/contracts/repositories.ts`

**File**: `src/core/contracts/repositories.ts`
**Changes**: Added `TenantAttributesRepository` interface + re-export `TenantAttributes`.

### [x] Task RF3: Add `TENANT_ATTRIBUTES_REPOSITORY` DI token

**File**: `src/core/contracts/index.ts`
**Changes**: Added `TENANT_ATTRIBUTES_REPOSITORY: Symbol(...)` to `AUTHORIZATION` token map.

### [x] Task RF4: Update `DefaultAuthorizationService`

**File**: `src/modules/authorization/domain/AuthorizationService.ts`
**Changes**: Added `tenantAttributesRepository` constructor arg. After membership check: fetches tenant attributes, builds `enrichedContext`, delegates to PolicyEngine with enriched context. Billing writes to DB → authorization reads DB, never calls Stripe.

### [x] Task RF5: Add `MockTenantAttributesRepository`

**File**: `src/modules/authorization/infrastructure/MockRepositories.ts`
**Changes**: Added `MockTenantAttributesRepository` returning free-tier defaults.

### [x] Task RF6: Register new repo in DI module

**File**: `src/modules/authorization/index.ts`
**Changes**: Instantiated and registered `MockTenantAttributesRepository`; wired into `DefaultAuthorizationService`.

### [x] Task RF7: Remove `userId` from `AuthorizationContext.tenant` object literals

**Files**: `secure-action.ts`, `authorization.integration.test.ts`, `PolicyEngine.test.ts`, `ConditionEvaluator.test.ts`, `integration.test.ts`, `proxy.test.ts`, `proxy-runtime.integration.test.ts`, `with-auth.test.ts`
**Changes**: Removed excess `userId` from all `tenant: { ... }` object literals. Structural subtyping handles `TenantContext` variable assignments in `with-auth.ts`.

### [x] Task RF8: Gate verification

| Gate                    | Result                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`        | ✅ PASS                                                                 |
| `pnpm skott:check:only` | ✅ PASS                                                                 |
| `pnpm madge`            | ✅ PASS — No circular dependency found                                  |
| `pnpm depcheck`         | ✅ PASS — No depcheck issue                                             |
| `pnpm env:check`        | ✅ PASS — .env.example in sync                                          |
| `pnpm test`             | ✅ PASS — 360 passed (64 files)                                         |
| Forbidden import scans  | ✅ CLEAN — only composition-root exception in `core/container/index.ts` |

## Clerk Runtime Fix — proxy.ts + with-auth.ts Restored to Remote Main Pattern

### [x] Task RF9: Restore options-based `withAuth` + per-request container in `proxy.ts`

**Root cause**: `withAuth` was refactored to use the global DI container directly (1-arg). `ClerkIdentityProvider.getCurrentIdentity()` → `auth()` requires the Clerk middleware context. When `withAuth` resolved `identityProvider` from the container and called `getCurrentIdentity()`, it worked only if `clerkMiddleware()` was the outermost wrapper. The real issue was that `proxy.ts` had lost the per-request container pattern and the `resolveIdentity`/`resolveTenant` closures that use `auth` from the middleware callback.

**Fix**: Restored remote main's proven pattern:

- `with-auth.ts`: Accepts `(handler, options)` with `{ dependencies, userRepository, resolveIdentity?, resolveTenant? }`. Added fast path for public non-auth routes. Kept ABAC `environment` enrichment.
- `proxy.ts`: Per-request `createContainer()` inside `clerkMiddleware` callback. Closure-based `resolveIdentity` and `resolveTenant` using `auth` from middleware (never global `auth()`). `composeMiddlewares` helper.
- `with-auth.test.ts`: Updated to options-based pattern (no container registration). Added `securityDependencies` object passed explicitly.
- `middleware.test.ts`: Updated to options-based `withAuth` call with explicit dependencies.

**Gate results (post-fix)**:

| Gate                    | Result                          |
| ----------------------- | ------------------------------- |
| `pnpm typecheck`        | ✅ PASS                         |
| `pnpm lint`             | ✅ PASS — 0 errors              |
| `pnpm skott:check:only` | ✅ PASS                         |
| `pnpm madge`            | ✅ PASS — No circular deps      |
| `pnpm depcheck`         | ✅ PASS                         |
| `pnpm env:check`        | ✅ PASS                         |
| `pnpm test`             | ✅ PASS — 360 passed (64 files) |
| Forbidden import scans  | ✅ CLEAN                        |
