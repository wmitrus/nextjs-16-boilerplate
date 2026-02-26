# Prompt Pack - Modular Monolith Extensions

## Purpose

This folder contains production prompts for the next approved extension use cases.

These prompts are designed for:

- human engineers,
- AI coding assistants,
- SSD workflows.

All prompts are aligned with:

- `docs/architecture/12 - Implementation Guardrails & AI Prompt Contract.md`
- `docs/architecture/11 - Development Commitment & Extension Contract.md`

---

## Mandatory execution order

1. `00 - RBAC Baseline Hardening Prompt.md`
2. `01 - ABAC Foundation Prompt.md`
3. `02 - Multi-Tenant Isolation Prompt.md`
4. `03 - Per-Tenant Feature Flags Prompt.md`
5. `04 - Per-Request Caching Prompt.md`
6. `05 - Background Workers Prompt.md`

Do not start a later prompt before the previous prompt is accepted.

---

## Required output from every prompt run

Before implementation:

1. Architecture understanding statement
2. Layer impact summary (`app/features/modules/security/shared/core`)
3. Contract changes (if any)

After implementation:

1. Changed-file layer mapping
2. Gate execution results:
   - `pnpm typecheck`
   - `pnpm skott:check:only`
   - `pnpm madge`
   - `pnpm depcheck`
   - `pnpm env:check`
   - `pnpm test`
3. Forbidden import scan results
4. Final compliance verdict (PASS/FAIL)

---

## Failure rule

If any guardrail is violated, stop implementation and redesign before continuing.
