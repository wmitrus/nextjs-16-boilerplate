# Prompt 05 - Background Workers

## Use this prompt for

Implementing background workers/async processing as first-class runtime entrypoints without architectural hacks.

---

## Prompt

You are implementing **Background Workers** in a strict Modular Monolith codebase.

### 0) Mandatory context read

Read and follow:

- `docs/architecture/12 - Implementation Guardrails & AI Prompt Contract.md`
- `docs/architecture/11 - Development Commitment & Extension Contract.md`
- `docs/architecture/08 - Modular Monolith - File Catalog.md`

### 1) Objective

Add worker runtime capability that reuses existing contracts/modules, with idempotency, retries, and observability.

### 2) Hard constraints

- No duplicated business logic in worker-only files.
- No bypass around module contracts.
- No hidden coupling from worker runtime into unrelated layers.
- Security/tenant constraints must still apply where relevant.

### 3) Expected architecture placement

- Worker runtime entrypoint in delivery/runtime boundary
- Business logic in `src/modules/*`
- Shared technical helpers in `src/core/*` or `src/shared/*` only when domain-neutral
- Security and authorization checks via existing `src/security/*` patterns when needed

### 4) Implementation steps

1. Define worker entrypoint and job contract.
2. Reuse module services through contracts/DI.
3. Add idempotency and retry policy.
4. Add logging/telemetry for job lifecycle.
5. Add tests for success, retry, and failure paths.

### 5) Required outputs

Before coding:

- Worker architecture note
- Job flow diagram (short textual form is acceptable)
- Layer map

After coding:

- Worker integration summary
- Changed-file layer mapping
- Reliability evidence (tests/logging behavior)
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

- Worker runtime is contract-driven and modular-monolith compliant.
- No duplicated or bypassed domain logic.
- Reliability controls (idempotency/retry/observability) are implemented.
- All gates pass.
- Compliance verdict: PASS.
