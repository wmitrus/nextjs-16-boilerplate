---
name: safe-feature-workflow
description: Feature-delivery workflow for this repository. Use for new features or non-trivial behavior changes that need constraint-first delivery across architecture, security/auth, Next.js runtime, implementation, and validation. Use the fast path only when architecture, security, runtime, contracts/DI, and significant public behavior are clearly unaffected.
---

# Safe Feature Workflow

Coordinate safe feature delivery with the minimum specialist work needed before implementation.

Own sequencing, handoffs, block/go decisions, and workflow artifacts. Do not duplicate specialist analysis.

## Context Loading

Inherit repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Safe Feature Workflow;
- security/auth/runtime/validation catalogues.

At start:

1. inspect the request and enough live code/evidence to classify the change;
2. decide whether the fast path is clearly safe;
3. identify only the specialists actually needed;
4. invoke those skills and let each perform its own targeted retrieval;
5. load the neutral workflow source only when workflow semantics are unclear or being audited/changed.

If requirements are materially messy or underspecified, use `task-brief-authoring` first.

## Entry and Fast Path

Use for new features, non-trivial behavior changes, and cross-file changes that may affect boundaries, auth, tenancy, runtime, caching, request handling, contracts, DI/composition, or tests.

Do not use for trivial copy/formatting, clearly isolated mechanical changes, read-only audits, or refactors better handled by the refactor workflow.

Evaluate the High-Risk Path classification below before Fast Path eligibility. If any high-risk trigger applies, Fast Path is unavailable regardless of file count — use the High-Risk Path instead. Only evaluate the following criteria for work already determined not to be high-risk.

Use the fast path only when **all** are clearly true:

- few files;
- no architecture/module-boundary effect;
- no auth/security/tenancy/trust-boundary effect;
- no runtime/request/caching/revalidation effect;
- no contract or DI/composition change;
- no significant public-behavior change.

If any criterion is uncertain, use the standard path.

Fast path:

1. intake/scope;
2. `implementation-agent`;
3. focused validation, using `validation-strategy` when scope is non-obvious;
4. close-out.

Implementation must still keep blast radius low, update tests when behavior changes, and surface unexpected specialist concerns.

## Task Lifecycle and Artifacts

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

For `.copilot/tasks/{task_id}/` work:

- create/update `plan.md`, then `intake.md`;
- keep durable checklist/state synchronized;
- create specialist summaries only for passes actually run;
- create/update `validation-report.md` after validation;
- reuse existing role summaries instead of creating duplicates;
- read only artifacts relevant to the active phase.

## Standard Sequence

### 1. Intake and Scope

Determine:

- requested behavior/acceptance criteria;
- likely affected modules/layers/files;
- explicit constraints/non-goals;
- possible architecture, DI, security/tenancy, runtime, request, caching, or validation risk.

Make only low-risk assumptions. Do not decide specialist-owned policy during intake.

### 2. Architecture Guard

For non-trivial standard-path work, invoke `architecture-guard` first.

Required handoff:

- architecture fit;
- affected ownership/boundaries;
- structural constraints;
- minimum safe shape;
- stop/go decision.

### 3. Conditional Security/Auth

Invoke `security-auth` only when work touches or may affect authentication, authorization, roles/policies, tenant/org/resource scope, membership, provider isolation, trust boundaries, sensitive data, or security enforcement.

Required handoff:

- security/auth constraints;
- enforcement points;
- trust/tenant/sensitive-data constraints;
- stop/go decision.

The specialist owns SEC/auth-flow retrieval.

### 4. Conditional Next.js Runtime

Invoke `nextjs-runtime` only when work touches or may affect `src/app/**`, App Router semantics, Server/Client placement, server actions, route handlers, `src/proxy.ts`, caching/revalidation, request-time rendering, instrumentation/env exposure, or deployment runtime.

Required handoff:

- runtime constraints;
- placement/caching/request-time guidance;
- stop/go decision.

The specialist owns version/config-specific verification.

### 5. Consolidate Constraints

Produce one implementation-ready summary containing:

- architecture constraints;
- security/auth constraints when applicable;
- runtime constraints when applicable;
- explicitly allowed scope;
- explicitly forbidden changes;
- known validation risks.

Remove duplication without weakening constraints.

If any specialist-owned decision remains unresolved, stop before implementation.

### 6. Implementation

Invoke `implementation-agent` with the request, acceptance criteria, affected scope, consolidated constraints, allowed/forbidden scope, and known validation risks.

Require:

- live-code inspection first;
- smallest correct production-grade change;
- tests updated when behavior changes;
- no architecture/security/runtime redesign;
- uncertainty surfaced instead of guessed.

### 7. Validation

Require validation proportional to risk:

- targeted checks first;
- typecheck and broader tests when justified by the actual failure mode;
- use `validation-strategy` when the minimum safe scope is not already clear;
- do not broaden to E2E without a concrete risk.

When `validation-strategy` is used, consume its required/optional/not-required evidence plan rather than duplicating its reasoning here.

### 8. Optional Architecture Recheck

Optionally run `architecture-guard` again when implementation materially affects multiple modules, contracts, DI/composition, security enforcement points, runtime placement, or another structural boundary where implementation drift is plausible.

### High-Risk Path

Not a second workflow — an additional sequence layered onto the standard one for high-risk work. A change is high-risk when it materially involves production-facing tooling; security/auth/trust boundaries; credentials or remote connections; persisted evidence, integrity, approval, or compatibility artifacts; migrations or data safety; tenancy/resource isolation; CI/deployment safety gates; external-tool semantics load-bearing for a correctness/security claim; or a broad refactor where preserving existing behavior is itself the main invariant. Do not apply to routine low-risk changes.

For high-risk work: apply Steps 2-4 as applicable; before implementation, produce `implementation-agent`'s compact invariant/trust-boundary map; implement; run focused development tests; perform `implementation-agent`'s pre-close falsification pass; add/fix regression evidence for any discovered gap; perform proportional validation; run a post-implementation `security-auth` recheck against the final delivered behavior when the changed high-risk invariant itself materially affects authentication, authorization, tenancy/resource isolation, trust boundaries, or sensitive-data/security enforcement, OR when one of the production-tooling triggers applies (production-facing tooling, persisted approval/integrity evidence, remote credentials/connections, a future production safety gate) — stay proportional: no second pass for an ordinary low-risk feature, and none for a high-risk change with no actual security invariant merely because it is high-risk for an unrelated reason; inspect the final full diff; reconcile the authoritative current-state documentation where behavior/contracts changed (one canonical current-state source, pointers elsewhere, no mutable review-round count as load-bearing contract); perform one final self-review of the complete diff; only then request external review.

**Review stop condition:** fresh external review is required after executable code changes responding to substantive findings, security/trust-boundary behavior changes, or operator documentation changes that materially change the execution/security contract. Do not force another review cycle when executable/security behavior is already stable and externally reviewed and the remaining changes are self-referential review-history bookkeeping, formatting, or equivalent non-load-bearing documentation cleanup.

**Operational handoff wording** (use on demand, do not copy into every root/skill):

- Implementation handoff: "Before pushing high-risk work, review your own final diff adversarially. Identify the invariants changed by the implementation and try to falsify the complete contract, not only the happy path. Inspect adjacent producers/consumers and add regression tests for any real gap before requesting external review."
- Review-fix handoff: "Fix the underlying invariant rather than only the cited line. Re-review the full affected contract and applicable adjacent failure modes before pushing the next review revision."

## Block Conditions

Stop before implementation when:

- architecture fit/module ownership/DI is unresolved;
- auth/trust/tenant/resource-scope policy is unresolved;
- runtime placement/caching/request behavior is unresolved;
- repository evidence is materially contradictory;
- the request is too ambiguous to implement safely;
- required scope exceeds the approved blast radius;
- a specialist returns a block.

In a blocked state, do not implement. State the exact blocker and the owning specialist/decision.

## Close-Out

Before success:

- inspect the final diff for unintended scope;
- confirm required validation or record blocked/deferred evidence;
- update artifacts when applicable;
- report residual risks/follow-ups;
- close Leantime only after repository closure conditions are satisfied.

A successful run uses the right specialists in the right order, avoids duplicated review, establishes constraints before implementation, keeps scope narrow, and produces meaningful validation evidence.

Retain in the workflow outcome:

- affected files/modules;
- implementation result;
- validation result;
- residual risks/follow-ups.

## Response

For substantial kickoff/review output:

1. Objective
2. Input Sources
3. Feature Classification
4. Planned Specialist Sequence
5. Artifacts To Be Produced
6. Current Status
7. Recommended Next Action

During later phases, use the more specific active specialist response shape when more useful.

## Source and Compatibility

`docs/ai/general/Workflow 01 - Safe Feature Workflow.md` remains the neutral cross-tool workflow authority.

For Claude Code, this skill changes context-loading mechanics only: specialist details are delegated to their skills instead of preloaded here.

If shared workflow semantics change, propagate that semantic change according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary feature delivery.
