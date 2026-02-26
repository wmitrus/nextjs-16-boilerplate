# Prompt 04 - Per-Request Caching

## Use this prompt for

Adding request-lifetime caching/memoization without cross-request or cross-tenant bleed.

---

## Prompt

You are implementing **Per-Request Caching** in a strict Modular Monolith codebase.

### 0) Mandatory context read

Read and follow:

- `docs/architecture/12 - Implementation Guardrails & AI Prompt Contract.md`
- `docs/architecture/11 - Development Commitment & Extension Contract.md`
- `docs/architecture/03 - Authorization Flow.mmd`

### 1) Objective

Introduce cache behavior scoped to request lifetime while preserving contract boundaries and security/tenant isolation.

### 2) Hard constraints

- No global mutable cache for request-level concerns.
- No cache state leakage across tenants or requests.
- No business logic moved into `shared/*` just to cache data.

### 3) Expected architecture placement

- Cache adapter/interface (if needed) via `src/core/contracts/*`
- Request-scoped wiring in composition roots/security context path
- Domain usage through injected dependencies only

### 4) Implementation steps

1. Define request cache abstraction (if needed).
2. Wire cache into request-scoped dependency assembly.
3. Apply caching only to idempotent/safe repeated lookups.
4. Ensure tenant keying and request isolation.
5. Add tests for no cross-request and no cross-tenant bleed.

### 5) Required outputs

Before coding:

- Cache scope design note
- Affected files + layer map

After coding:

- Caching behavior summary
- Isolation proof from tests
- Gate and scan results

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

- Caching is request-scoped and tenant-safe.
- No architecture boundary regressions.
- All gates pass.
- Compliance verdict: PASS.
