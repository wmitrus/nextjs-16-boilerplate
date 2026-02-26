# Prompt 01 - ABAC Foundation

## Use this prompt for

Introducing Attribute-Based Access Control (ABAC) on top of the existing authorization model, without breaking modular monolith boundaries.

Prerequisite: Prompt `00 - RBAC Baseline Hardening Prompt.md` must be completed and accepted.

---

## Prompt

You are implementing **ABAC Foundation** in a strict Modular Monolith codebase.

### 0) Mandatory context read

Read and follow:

- `docs/architecture/12 - Implementation Guardrails & AI Prompt Contract.md`
- `docs/architecture/11 - Development Commitment & Extension Contract.md`
- `docs/architecture/08 - Modular Monolith - File Catalog.md`
- `docs/architecture/03 - Authorization Flow.mmd`

### 1) Objective

Extend authorization to support ABAC conditions and attributes while preserving current security API surfaces and dependency direction.

ABAC must extend (not replace or bypass) the validated RBAC baseline.

### 2) Hard constraints

- Do not move policy logic into `shared/*`.
- Do not leak provider SDK into contracts/domain.
- Do not introduce reverse dependency into `core`.
- Keep `security/*` API stable unless explicitly required and justified.

### 3) Expected architecture placement

- Contracts/context: `src/core/contracts/authorization.ts`
- Domain decision logic: `src/modules/authorization/domain/*`
- Policy evaluation extensions: `src/modules/authorization/domain/policy/*`
- Security integration stays in existing contract-driven usage (`src/security/*`)

### 4) Implementation steps

1. Analyze current authorization context and policy engine capabilities.
2. Add/adjust ABAC-relevant attributes in contract context (minimal and explicit).
3. Extend policy evaluation to process additional ABAC attributes safely.
4. Keep middleware and secure action boundaries stable.
5. Add unit tests for allow/deny attribute combinations.
6. Add/adjust integration tests validating ABAC path through existing facade.

### 5) Required outputs

Before coding:

- Architecture understanding statement
- Target files and layer mapping
- Contract change list

After coding:

- Summary of ABAC behavior introduced
- Changed-file layer mapping
- Test evidence and gate evidence

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

- ABAC decisions are implemented via contracts/domain policy engine.
- No architecture boundary violations are introduced.
- All mandatory gates pass.
- Compliance verdict: PASS.
