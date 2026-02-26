# Prompt 00 - RBAC Baseline Hardening (Auth + Authorization Coupling)

## Use this prompt for

Validating and hardening RBAC as a prerequisite for all further extensions.

This prompt is mandatory because `auth` and `authorization` modules are interdependent in runtime behavior and cannot be safely evolved in isolation.

---

## Prompt

You are implementing **RBAC Baseline Hardening** in a strict Modular Monolith codebase.

### 0) Mandatory context read

Read and follow:

- `docs/architecture/12 - Implementation Guardrails & AI Prompt Contract.md`
- `docs/architecture/11 - Development Commitment & Extension Contract.md`
- `docs/architecture/03 - Authorization Flow.mmd`
- `docs/architecture/08 - Modular Monolith - File Catalog.md`

### 1) Objective

Establish a verified RBAC baseline where:

- identity/role source of truth is explicit,
- auth-to-authorization handoff is contract-driven,
- role enforcement is deterministic across middleware and secure actions,
- baseline tests prove modules work together.

### 2) Hard constraints

- Do not couple `auth` and `authorization` via internal module imports that bypass contracts.
- Do not place role-policy logic in `shared/*` or delivery files.
- Do not leak provider-specific metadata assumptions into domain contracts.

### 3) Required architecture checks

Validate these relationships explicitly:

1. Role acquisition path (`identity -> tenant -> roles`) is clear and testable.
2. Security context role value is used consistently by authorization facade.
3. Authorization decisions are made by contract-driven services.
4. Middleware and secure actions enforce required role behavior consistently.

### 4) Implementation steps

1. Map current RBAC flow across:
   - `src/modules/auth/*`
   - `src/modules/authorization/*`
   - `src/security/core/*`
   - `src/security/middleware/*`
   - `src/security/actions/*`
2. Normalize any inconsistent role checks into existing facade/service path.
3. Add/adjust tests for:
   - unauthenticated deny,
   - role floor checks (guest/user/admin),
   - stable auth + authorization handoff,
   - tenant + role combination edge cases.
4. Confirm no boundary violations are introduced.

### 5) Required outputs

Before coding:

- RBAC architecture understanding statement
- Coupling map (`auth` ↔ `authorization` through contracts)
- Candidate files and layer mapping

After coding:

- RBAC baseline summary
- Changed-file layer mapping
- Test + gate results
- Explicit “Ready for Prompt 01 ABAC” decision

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

- RBAC behavior is consistent across security middleware and secure actions.
- Auth/authorization coupling is contract-driven and explicit.
- Integration tests prove modules operate correctly together.
- All gates pass.
- Compliance verdict: PASS.
