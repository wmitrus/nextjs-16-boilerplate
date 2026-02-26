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

### [ ] Task 7: Strong RBAC typing — centralize UserRole, ROLES, ROLE_HIERARCHY in core/contracts

**Objective**: Make role types/constants defined once in `src/core/contracts/roles.ts`, importable everywhere without raw strings.

**Files**:

- NEW `src/core/contracts/roles.ts` — `UserRole`, `ROLES`, `ROLE_HIERARCHY`
- Update: `security-context.ts`, `authorization-facade.ts`, `secure-action.ts`, `security-context.mock.ts`, `secure-action.mock.ts`, `MockRepositories.ts`, `tests/setup.tsx`, all test files with raw role strings, `showcase-actions.ts`, `AdminOnlyExample.tsx`

**Verification**: `pnpm typecheck && pnpm test`

---

### [ ] Task 8: RBAC documentation in docs/features/

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
