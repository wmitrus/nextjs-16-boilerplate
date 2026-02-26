# 11 - Development Commitment & Extension Contract

## Document status

**FINAL COMMITMENT (Team Baseline)**

This document is the formal architectural commitment for continued system development on top of the Modular Monolith implementation in branch `feat/modular-monolith`.

Related source documents:

- `docs/architecture/09 - Final Modular Monolith Compliance Report.md`
- `docs/architecture/10 - Executive Sign-Off - Modular Monolith.md`
- `docs/architecture/08 - Modular Monolith - File Catalog.md`

---

## Commitment (extensibility guarantees)

With current layer rules and contracts preserved, the team is formally approved to evolve the system **without refactoring the architectural foundation**:

- ✔ you can introduce ABAC without changing the security foundation
- ✔ you can introduce multi-tenant isolation
- ✔ you can introduce per-tenant feature flags
- ✔ you can introduce per-request caching
- ✔ you can implement background workers without hacks

**Operational commitment:**

> For the above development directions, we do not plan a “large rescue refactor in one month”,
> as long as incoming changes remain compliant with architecture contracts and quality gates.

---

## Why this is possible (proof-by-design)

### 1) ABAC without changing the security foundation

- The `security/*` layer already depends on contracts and `AuthorizationService`.
- ABAC evolution happens through:
  - `src/core/contracts/authorization.ts` (decision context),
  - `src/modules/authorization/domain/AuthorizationService.ts`,
  - `src/modules/authorization/domain/policy/PolicyEngine.ts`,
  - policy repositories in the authorization module.
- Middleware and secure actions remain stable (`with-auth`, `secure-action`) and only receive a richer decision context.

### 2) Multi-tenant isolation

- Tenant context is already a contract (`src/core/contracts/tenancy.ts`) and part of security context.
- Isolation is implemented through resolver + membership/policy logic in the authorization module, not by rebuilding the delivery layer.

### 3) Per-tenant feature flags

- Request-scoped context already exists (`src/security/core/request-scoped-context.ts`).
- Per-tenant feature flags can be injected via metadata/request scope or a dedicated contract/repository.
- This does not require violating layer boundaries.

### 4) Caching per request

- The request-scoped dependency pattern is already active (proxy + security dependencies).
- You can add a request cache adapter (e.g., memoization/request store) without global mutable state and without refactoring domain modules.

### 5) Background workers without hacks

- The modular monolith and contracts allow running a worker as an additional delivery/runtime entrypoint.
- Workers use the same `core/*` contracts and `modules/*` logic (without copying logic into `app/*`).

---

## Non-negotiable rules (to keep this commitment valid)

1. No reverse dependency into `core` (except intentional composition root registration).
2. No domain policy logic in `shared/*`.
3. No provider SDK leakage into domain contracts.
4. Security enforcement remains centralized in `security/*` + contracts.
5. Every PR must pass required gates.

---

## Required PR Gates

Every architecture change / extension must pass:

1. `pnpm typecheck`
2. `pnpm skott:check:only`
3. `pnpm madge`
4. `pnpm depcheck`
5. `pnpm env:check`
6. `pnpm test`

Failure of any gate = no merge approval.

---

## Recommended implementation order (safe sequence)

Order that minimizes risk and change cost:

1. **RBAC baseline hardening (auth + authorization together)**
   - Validate role source of truth and role-resolution flow between auth and authorization modules.
   - Ensure RBAC contract behavior is explicit and covered by integration tests.
2. **ABAC foundation**
   - Extend policy model and `AuthorizationContext` (without changing public security middleware API).
   - Add policy-engine domain tests for new ABAC conditions.
3. **Multi-tenant isolation hardening**
   - Complete membership checks + tenant boundary enforcement on critical paths.
   - Add cross-tenant deny/allow tests.
4. **Per-tenant feature flags**
   - Introduce a flag contract/repository and pass it into request scope.
   - Roll out read-only flags first, then behavior-driving flags.
5. **Caching per request**
   - Add a request-scoped cache adapter (memoization within request lifetime).
   - Verify no cache bleed between tenants or requests.
6. **Background workers**
   - Run workers as separate runtime entrypoints using the same contracts and modules.
   - Add idempotency + retry policy + observability for jobs.

Rollout rule: **contracts and tests first, implementation second, optimizations last**.

---

## Contract for future implementations

For every new epic (ABAC, tenant isolation, flags, caching, workers), Definition of Done includes:

- preserving layer boundaries,
- no violations of `core/contracts/*` contracts,
- unit/integration tests for the new path,
- architecture doc updates scoped only to the extension (without rewriting the foundation).

---

## Final statement

**This is the final commitment document for further development and system scaling.**

The architecture is ready for enterprise extensions and does not require a planned base refactor for the listed development directions.
