# Prompt 03 - Per-Tenant Feature Flags

## Use this prompt for

Adding feature flag control scoped by tenant, without breaking layer boundaries.

---

## Prompt

You are implementing **Per-Tenant Feature Flags** in a strict Modular Monolith codebase.

### 0) Mandatory context read

Read and follow:

- `docs/architecture/12 - Implementation Guardrails & AI Prompt Contract.md`
- `docs/architecture/11 - Development Commitment & Extension Contract.md`
- `docs/architecture/08 - Modular Monolith - File Catalog.md`

### 1) Objective

Introduce tenant-scoped feature flags through contracts and request-scoped context, preserving modular boundaries.

### 2) Hard constraints

- No feature-flag policy logic in `shared/*`.
- No flag provider leakage into domain contracts.
- No direct app-layer toggling that bypasses module/security contracts.

### 3) Expected architecture placement

- Contracts/tokens (if needed): `src/core/contracts/*`
- Flag retrieval logic: `src/modules/*` (or dedicated module)
- Runtime propagation: `src/security/core/request-scoped-context.ts` and composition roots
- Delivery consumption via contract-driven interfaces only

### 4) Implementation steps

1. Define feature-flag contract and shape (minimal API).
2. Add tenant-aware flag retrieval implementation.
3. Inject flags into request scope.
4. Add safe consumption path in feature/module orchestration.
5. Add tests for tenant A/B differences and default fallback behavior.

### 5) Required outputs

Before coding:

- Proposed contract API
- Layer placement map

After coding:

- Flag architecture summary
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

- Feature flags are tenant-scoped and contract-driven.
- Request-scoped propagation is in place where required.
- No boundary violations introduced.
- All gates pass.
- Compliance verdict: PASS.
