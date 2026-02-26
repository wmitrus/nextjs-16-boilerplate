# Prompt 02 - Multi-Tenant Isolation Hardening

## Use this prompt for

Hardening tenant boundaries so cross-tenant access is impossible by design and by enforcement.

---

## Prompt

You are implementing **Multi-Tenant Isolation Hardening** in a strict Modular Monolith codebase.

### 0) Mandatory context read

Read and follow:

- `docs/architecture/12 - Implementation Guardrails & AI Prompt Contract.md`
- `docs/architecture/11 - Development Commitment & Extension Contract.md`
- `docs/architecture/05 - Tenant Resolution Abstraction.mmd`
- `docs/architecture/03 - Authorization Flow.mmd`

### 1) Objective

Guarantee tenant-bound access checks across critical paths using existing contract-driven architecture.

### 2) Hard constraints

- No tenant logic in `shared/*`.
- No direct provider coupling in domain contracts.
- No bypass of authorization/membership checks in delivery layer.
- No cross-module internals access without contracts.

### 3) Expected architecture placement

- Tenant contracts/resolution: `src/core/contracts/tenancy.ts`, auth adapter layer
- Membership/policy checks: `src/modules/authorization/*`
- Security enforcement/handoff: `src/security/*`
- Delivery remains orchestration-only: `src/app/*`, `src/features/*`

### 4) Implementation steps

1. Identify all tenant-sensitive flows.
2. Validate tenant context acquisition and propagation.
3. Harden membership validation in authorization service path.
4. Ensure deny-by-default on tenant mismatch.
5. Add integration tests for cross-tenant deny and same-tenant allow.
6. Verify no tenant logic leaks into forbidden layers.

### 5) Required outputs

Before coding:

- Tenant boundary threat model summary (short)
- Impacted files and layer mapping

After coding:

- Tenant enforcement summary
- Changed-file layer mapping
- Gate and test results

### 6) Mandatory verification

Run and report:

1. `pnpm typecheck`
2. `pnpm skott:check:only`
3. `pnpm madge`
4. `pnpm depcheck`
5. `pnpm env:check`
6. `pnpm test`

Run and report forbidden import scans:

- `grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared || true`
- `grep -RInE "from ['\"]@/(app|features|security)/" src/modules || true`
- `grep -RInE "from ['\"]@/(app|features|modules)/" src/security || true`
- `grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core || true`

### 7) Acceptance criteria

- Cross-tenant access is denied on all critical paths.
- Tenant checks are contract-driven and centralized.
- All gates pass.
- Compliance verdict: PASS.
