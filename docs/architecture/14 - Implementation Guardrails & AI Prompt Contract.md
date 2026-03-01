# 12 - Implementation Guardrails & AI Prompt Contract

## Purpose

This is the **mandatory operating instruction** for all future design and implementation work.

It exists to prevent architecture drift and to protect the Modular Monolith baseline approved in:

- [01 - Global Dependency Rules.mmd](./01%20-%20Global%20Dependency%20Rules.mmd)
- [02 - Full Module Structure.mmd](./02%20-%20Full%20Module%20Structure.mmd)
- [03 - Authorization Flow.mmd](./03%20-%20Authorization%20Flow.mmd)
- [04 - Auth Provider Isolation.mmd](./04%20-%20Auth%20Provider%20Isolation.mmd)
- [05 - Tenant Resolution Abstraction.mmd](./05%20-%20Tenant%20Resolution%20Abstraction.mmd)
- [06 - Ideal FInal Dependency Graph (strict).mmd](./06%20-%20Ideal%20FInal%20Dependency%20Graph%20%28strict%29.mmd)
- [07 - Enterprise Grade Check Graph.mmd](./07%20-%20Enterprise%20Grade%20Check%20Graph.mmd)
- [08 - Modular Monolith - File Catalog.md](./08%20-%20Modular%20Monolith%20-%20File%20Catalog.md)
- [09 - Final Modular Monolith Compliance Report.md](./09%20-%20Final%20Modular%20Monolith%20Compliance%20Report.md)
- [10 - Executive Sign-Off - Modular Monolith.md](./10%20-%20Executive%20Sign-Off%20-%20Modular%20Monolith.md)
- [11 - Development Commitment & Extension Contract.md](./11%20-%20Development%20Commitment%20%26%20Extension%20Contract.md)

---

## Non-negotiable rule

**No design and no implementation may start until this document and the architecture baseline docs above are read and acknowledged.**

If context is missing, the task must stop and perform architecture context sync first.

---

## 1) Mandatory read order (human + AI)

Before any design/code work, read in this order:

1. `12 - Implementation Guardrails & AI Prompt Contract.md` (this file)
2. `10 - Executive Sign-Off - Modular Monolith.md`
3. `11 - Development Commitment & Extension Contract.md`
4. `08 - Modular Monolith - File Catalog.md`
5. `01..07` diagrams
6. Relevant feature/domain docs for the target scope

Output required before design begins:

- A short “Architecture Understanding Statement” confirming constraints and affected layers.

---

## 1.1 Mandatory prompt-pack usage for next extensions

For the approved extension roadmap, implementation must start from the prompt pack in `docs/prompts/*`.

Execution order is fixed:

1. RBAC baseline hardening (auth + authorization coupling)
2. ABAC foundation
3. Multi-tenant isolation hardening
4. Per-tenant feature flags
5. Per-request caching
6. Background workers

Rules:

- Do not start Prompt `N+1` before Prompt `N` reaches acceptance criteria.
- If any prompt conflicts with this document, this document takes precedence.
- Each prompt run must produce: architecture note, changed-file layer mapping, and gate results.

---

## 2) Modular Monolith guardrails

### 2.1 Allowed dependency direction

- `app -> features/modules/security/shared/core`
- `features -> modules/security/shared/core`
- `modules -> core/shared`
- `security -> core/shared`
- `shared -> core`
- `core ->` no reverse dependency to `modules/security/features/app` (except composition-root module registration pattern)

### 2.2 Forbidden behavior

- No business/policy logic in `shared/*`
- No provider SDK leakage into domain contracts
- No direct cross-module internals access bypassing contracts
- No hidden service locator patterns in runtime security paths
- No ad-hoc security logic in random delivery files when centralized security components exist

### 2.3 Required architecture behavior

- Contract-first boundaries in `src/core/contracts/*`
- Dependency assembly at composition roots (explicit, request-scoped where applicable)
- Provider-specific integrations isolated to adapters/framework boundaries
- Security policy enforcement centralized in `src/security/*`

---

## 3) Required directory and structure discipline

### 3.1 Top-level intent

- `src/app/*`: delivery/routing/runtime edges only
- `src/features/*`: feature orchestration
- `src/modules/*`: domain modules and adapters
- `src/security/*`: security middleware/actions/policy enforcement
- `src/shared/*`: neutral reusable utilities/components
- `src/core/*`: contracts, container, env, logger, foundational cross-cutting concerns

### 3.2 New capability placement rules

- New domain capability -> `src/modules/<capability>`
- New security rule/pipeline behavior -> `src/security/*`
- New reusable generic utility -> `src/shared/*` (must be domain-neutral)
- New contract/token -> `src/core/contracts/*`
- New framework route/page -> `src/app/*` (delegate business logic downward)

---

## 4) SSD workflow enforcement (mandatory)

All SSD workflows must follow this exact sequence.

### Phase 0 - Context Sync (mandatory)

- Read required architecture docs.
- Identify impacted layers.
- Declare allowed dependency direction for this change.

### Phase 1 - Architecture Fit

- Define where code belongs (`app/features/modules/security/shared/core`).
- Define required contracts and tokens.
- Reject any design that introduces reverse dependency or leakage.

### Phase 2 - Design Draft

- Produce a minimal design with explicit boundaries.
- Include data flow and dependency flow.
- Include test strategy and gate plan.

### Phase 3 - Implementation

- Implement contracts first when needed.
- Implement module/security logic in correct layer.
- Keep delivery layer thin.

### Phase 4 - Validation

Run all required gates:

1. `pnpm typecheck`
2. `pnpm skott:check:only`
3. `pnpm madge`
4. `pnpm depcheck`
5. `pnpm env:check`
6. `pnpm test`

### Phase 5 - Documentation Update

- Update architecture docs only where scope changed.
- Add traceability references if new architecture surface was introduced.

---

## 5) AI-safe implementation contract (copy-paste prompt)

Use this block as a standard prompt for any AI model/agent before design/coding:

```text
You are implementing in a strict Modular Monolith repository.

Mandatory constraints:
1) Read architecture docs 01..12 before proposing design.
2) Preserve dependency direction:
   - app -> features/modules/security/shared/core
   - features -> modules/security/shared/core
   - modules -> core/shared
   - security -> core/shared
   - shared -> core
   - core must not depend on modules/security/features/app (except composition-root registration).
3) Never place domain policy logic in shared/*.
4) Never leak provider SDK into domain contracts.
5) Keep security enforcement centralized in security/*.
6) Use contract-first changes in core/contracts/* when extending capabilities.
7) Keep delivery layer thin; delegate to modules/security.
8) Before finalizing, run and report:
   - pnpm typecheck
   - pnpm skott:check:only
   - pnpm madge
   - pnpm depcheck
   - pnpm env:check
   - pnpm test

If any rule is at risk, stop and redesign before coding.
```

---

## 6) Pre-design checklist (must be completed)

- [ ] I read docs `01..12` and understand the baseline.
- [ ] I identified affected layers and confirmed allowed dependency directions.
- [ ] I confirmed where new code must live (and where it must not).
- [ ] I identified whether a new contract/token is required.
- [ ] I confirmed no provider/domain/security leakage will be introduced.

If any checkbox is not true, do not start implementation.

---

## 7) Post-implementation verification protocol (mandatory)

Important: in software architecture there is no mathematical “100% forever” guarantee, but this protocol is the required high-assurance verification path for every merged implementation.

### 7.1 Required gate execution

All must pass in the implementation branch:

1. `pnpm typecheck`
2. `pnpm skott:check:only`
3. `pnpm madge`
4. `pnpm depcheck`
5. `pnpm env:check`
6. `pnpm test`

### 7.2 Forbidden import scans (layer drift detection)

Run and confirm no violations:

1. Shared cannot import upper/domain layers:
   - `grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared || true`
2. Modules cannot import delivery/features/security:
   - `grep -RInE "from ['\"]@/(app|features|security)/" src/modules || true`
3. Security cannot import app/features/modules directly:
   - `grep -RInE "from ['\"]@/(app|features|modules)/" src/security || true`
4. Core cannot import upper layers (except composition-root registration pattern):
   - `grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core || true`

If any unexpected match appears, stop and redesign.

### 7.3 Contract and variable placement verification

Verify all of the following:

- New capability boundaries are represented via `src/core/contracts/*` when required.
- No provider-specific types or SDK imports were introduced into domain contracts.
- New environment variables are defined in `src/core/env.ts` and mirrored in `.env.example`.
- No business decision variable was moved into `shared/*` or delivery files in a way that bypasses modules/security.

### 7.4 Changed-files architecture review

For every changed file in a PR, record:

1. Target layer (`app/features/modules/security/shared/core`)
2. Why this layer is correct
3. Dependency direction impact (inbound/outbound)
4. Whether contracts/tokens were changed

Any file without a justified layer assignment is non-compliant.

### 7.5 Merge decision rule

Merge is allowed only when all are true:

- All gates pass
- Forbidden import scans are clean
- Contract and variable placement verification is clean
- Changed-files architecture review is complete

Otherwise: do not merge.

---

## 8) PR acceptance checklist (architecture)

A PR is architecture-compliant only if all are true:

- [ ] Layer boundaries are preserved.
- [ ] No forbidden imports or reverse dependencies introduced.
- [ ] Security behavior remains centralized and contract-driven.
- [ ] `shared/*` remains domain-neutral.
- [ ] Required gates pass.
- [ ] Architecture docs updated when scope required it.

---

## 9) Violation protocol

If a violation is discovered:

1. Stop implementation.
2. Mark violation type:
   - Boundary violation
   - Provider leakage
   - Contract bypass
   - Security decentralization
3. Propose compliant redesign.
4. Re-run gates.
5. Continue only after compliance is restored.

---

## 10) Final enforcement statement

This document is binding for all contributors (human and AI).

No model, agent, workflow, or contributor is allowed to bypass these guardrails.
Design and implementation that ignore this contract are considered non-compliant and must not be merged.
