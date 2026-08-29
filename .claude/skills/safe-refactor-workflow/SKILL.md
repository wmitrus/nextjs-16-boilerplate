---
name: safe-refactor-workflow
description: Behavior-preserving refactor workflow for cleanup, dependency cleanup, module/file moves, DI cleanup, extraction, consolidation, code organization, boundary cleanup, or safer equivalent patterns where intended behavior must remain unchanged. Architecture Guard is required even on the fast path; Security/Auth and Next.js Runtime are conditional.
---

# Safe Refactor Workflow

Perform the smallest safe structural/code-quality improvement while preserving intended behavior and established architecture/security/runtime invariants.

This workflow owns refactor sequencing, protected-invariant consolidation, block/go decisions, and workflow artifacts. It does not duplicate specialist analysis.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Safe Refactor Workflow;
- Security Coding Patterns;
- Security/Auth or Next.js Runtime sources;
- the auth-flow corpus.

At workflow start:

1. inspect the request and enough live code to confirm this is actually a behavior-preserving refactor;
2. identify the observable behavior/contracts that must remain unchanged;
3. identify affected ownership, boundaries, DI/composition, security, and runtime surfaces;
4. invoke `architecture-guard`;
5. invoke Security/Auth or Runtime only when the affected surface requires them;
6. let each specialist perform its own targeted retrieval;
7. load the neutral workflow source only when workflow semantics themselves are unclear or being audited/changed.

## Entry Conditions

Use for:

- cleanup;
- dependency cleanup;
- file/module moves;
- code organization improvements;
- DI/composition cleanup;
- boundary cleanup;
- extraction or consolidation intended to preserve behavior;
- replacing weak patterns with safer equivalents without changing intended outcomes.

Do **not** use for:

- new features;
- intentional behavior changes;
- vulnerability remediation under active risk;
- auth bug fixes with unclear behavioral impact;
- runtime bug fixes that require behavior change;
- incident response;
- broad redesign disguised as cleanup.

Route those tasks to the appropriate feature, investigation, security-incident, or other workflow.

If safe refactoring depends on unresolved invariants, stop rather than guessing.

## Refactor Invariant

`refactor != rewrite`

`cleanup != permission to change behavior`

Before implementation, explicitly identify:

- expected unchanged observable behavior;
- public contracts that must remain stable;
- structural boundaries that must remain stable;
- security/auth invariants when relevant;
- runtime invariants when relevant;
- allowed implementation scope;
- forbidden refactor moves.

An intentional behavior or public-contract change requires explicit approval and may require reclassification out of this workflow.

## Fast Path

Evaluate the High-Risk Refactor Path classification below before Fast Path eligibility. If any high-risk trigger applies — including a small refactor whose correctness depends on load-bearing external-tool semantics — Fast Path is unavailable regardless of file count; use the High-Risk Refactor Path instead. Only evaluate the following criteria for work already determined not to be high-risk.

Use the reduced path only when **all** are clearly true:

- few files are affected;
- public contracts are unchanged;
- DI/composition is untouched;
- auth/security/trust-sensitive paths are untouched;
- runtime placement/caching/env exposure is unaffected;
- no module boundary is crossed;
- intended behavior remains unchanged.

If any criterion is uncertain, use the standard path.

Fast path still requires:

1. intake/refactor classification;
2. `architecture-guard`;
3. implementation;
4. validation.

Skip Security/Auth and Next.js Runtime only while evidence continues to show they are irrelevant.

## Task Lifecycle and Artifacts

Follow the repository task lifecycle from the root instructions.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

For `.copilot/tasks/{task_id}/` work:

- create/update `plan.md`, then `intake.md`;
- keep control-artifact/checklist state synchronized;
- create/update specialist summaries only for passes actually run;
- each specialist maintains exactly one persistent summary using its matching template;
- if implementation is materially performed, `04 - Implementation Agent - Summary.md` is mandatory;
- create/update `validation-report.md` after validation;
- read only artifacts relevant to the active phase.

## Standard Sequence

### 1. Intake and Refactor Classification

Confirm:

- this is refactor/cleanup, not feature delivery;
- expected unchanged behavior;
- affected modules/layers/contracts;
- possible boundary or DI/composition impact;
- possible auth/security/trust impact;
- possible runtime/cache/env impact;
- likely validation surface.

Classify the refactor shape, for example:

- ownership cleanup;
- DI/composition cleanup;
- organization/file/module move;
- extraction;
- consolidation;
- dependency cleanup;
- safer pattern replacement.

Make only low-risk assumptions.

### 2. Architecture Guard — Always

Invoke `architecture-guard` before implementation for every workflow path.

Required handoff:

- architecture fit;
- affected modules/layers/ownership;
- structural constraints;
- explicitly protected structural invariants;
- stop/go status.

Do not edit until Architecture Guard has made the refactor structurally executable.

### 3. Conditional Security/Auth

Invoke `security-auth` when the refactor touches or may affect:

- auth flows;
- authorization enforcement;
- tenancy/org/resource scope;
- membership/provider isolation;
- trust boundaries;
- sensitive-data handling;
- security-significant route handlers/server actions.

Required handoff:

- auth/security invariants that must remain unchanged;
- trust/scope constraints;
- security stop/go decision.

The specialist owns SEC/auth-flow retrieval.

### 4. Conditional Next.js Runtime

Invoke `nextjs-runtime` when the refactor touches or may affect:

- `src/app/**`;
- App Router boundaries;
- Server/Client placement;
- route handlers/server actions;
- `src/proxy.ts`;
- caching/revalidation;
- request-time/build-time behavior;
- runtime placement;
- env exposure/runtime assumptions.

Required handoff:

- runtime invariants;
- placement/cache/runtime constraints;
- runtime stop/go decision.

The specialist owns version/config-specific verification.

### 5. Refactor Constraint Summary

Consolidate without weakening:

- architecture constraints;
- security/auth constraints when applicable;
- runtime constraints when applicable;
- explicitly protected behavior/invariants;
- forbidden refactor moves;
- allowed implementation scope;
- public-contract stability requirements.

If any required invariant or specialist decision remains unresolved, stop here.

Do not let Implementation decide a missing architecture/security/runtime invariant.

### 6. Implementation

Invoke `implementation-agent` with:

- refactor goal;
- expected unchanged behavior;
- affected scope;
- protected invariants;
- consolidated approved constraints;
- allowed/forbidden moves.

Require:

- minimum safe refactor;
- narrow, reviewable edits;
- behavior preservation;
- no opportunistic redesign;
- no hidden feature work;
- no casual public-contract changes;
- no widened coupling;
- uncertainty surfaced instead of guessed;
- test updates when test or contract surfaces change.

### 7. Validation

Require validation proportional to refactor scope.

At minimum preserve the neutral workflow requirements:

- targeted tests first;
- typecheck;
- architecture lint when relevant;
- broader tests when the refactor crosses boundaries.

Also honor repository-wide closure gates inherited from `CLAUDE.md`.

Validation must confirm, as applicable:

- intended behavior remains intact;
- architecture boundaries remain intact;
- no new security issue was introduced;
- no new runtime issue was introduced.

Use `validation-strategy` when the minimum safe evidence is not already clear.

Do not broaden validation without a concrete risk.

### 8. Optional Post-Refactor Architecture Check

Run `architecture-guard` again when the refactor affects multiple modules, contracts, DI/composition, or structural boundaries and dependency drift is plausible.

When a refactor crosses multiple layers/contracts, strongly prefer this recheck.

Verify:

- no dependency drift;
- boundaries remain intact;
- implementation respected approved constraints.

### High-Risk Refactor Path

Not a second workflow — an additional sequence layered onto the standard one for high-risk refactors. A refactor is high-risk when it is broad enough that preserving existing behavior is itself the main invariant (for example touching ordering/concurrency, a shared execution path, or a widely reused helper), or when it otherwise materially involves production-facing tooling; security/auth/trust boundaries; credentials or remote connections; persisted evidence, integrity, approval, or compatibility artifacts; migrations or data safety; tenancy/resource isolation; CI/deployment safety gates; or external-tool semantics that are load-bearing for a correctness/security claim (the actual behavior of Git, a database client, the filesystem, a parser/runtime, or CI/deployment tooling). The external-tool-semantics trigger applies even to a small, local refactor whose correctness depends on that behavior — it does not also need to be broad or production-facing; this is not a directive to integration-test everything, only that such a task is high-risk even with a small diff. Do not apply to a small, local, clearly behavior-preserving refactor that triggers none of the above — the Fast Path above remains correct for those.

For a high-risk refactor: run Steps 1-5 above (Architecture Guard always first, Security/Auth and Next.js Runtime conditionally); before implementation, produce `implementation-agent`'s existing compact invariant/trust-boundary map for the invariants this refactor must preserve; implement the minimum behavior-preserving refactor; run focused tests; perform `implementation-agent`'s existing pre-close falsification pass against the preserved invariants — confirming the refactor did not silently change ordering/concurrency or another load-bearing invariant while appearing locally correct; add/fix regression evidence for any discovered gap; perform proportional validation; run the same post-implementation `security-auth` recheck against the final delivered behavior used by `safe-feature-workflow`'s High-Risk Path when the changed high-risk invariant itself materially affects authentication, authorization, tenancy/resource isolation, trust boundaries, or sensitive-data/security enforcement, OR when one of the production-tooling triggers applies (production-facing tooling, persisted approval/integrity evidence, remote credentials/connections, a future production safety gate) — skip it for a refactor that is high-risk only for an unrelated reason (e.g. ordering/concurrency or external-tool semantics with no security invariant); inspect the complete final diff; reconcile authoritative current-state documentation where structural/contract documentation actually changed; perform one final self-review of the complete diff; only then request external review.

**Review stop condition** (shared with `safe-feature-workflow`'s High-Risk Path): fresh external review is required after substantive executable, security/trust-boundary, or contract changes. Do not force another review cycle once the meaningful behavior is already reviewed and externally verified and the only remaining changes are formatting or self-referential documentation bookkeeping.

## Block Conditions

Stop and do not implement when:

- safe refactoring would require an unintended behavior change;
- required invariants are unclear;
- module ownership/dependency direction becomes weaker or unresolved;
- DI/composition decisions are unresolved;
- auth/security invariants are unclear;
- runtime placement/cache invariants are unclear;
- the task is actually a feature/redesign/incident/bugfix requiring another workflow;
- structural drift would be introduced in the name of simplification;
- required scope exceeds the approved blast radius.

State the exact blocker and which decision/specialist owns resolution.

## Close-Out

Before success:

- inspect final diff for accidental behavior/scope change;
- confirm protected invariants remain true;
- confirm required validation completed or record blocked/deferred evidence;
- update task artifacts when applicable;
- report residual risks/follow-ups;
- close Leantime only after closure conditions are satisfied.

## Refactor Status

For non-trivial runs, explicitly state exactly one:

- **SAFE TO REFACTOR**
- **REFACTOR IMPLEMENTED**
- **PARTIALLY IMPLEMENTED**
- **BLOCKED**
- **NOT SAFE TO REFACTOR YET**

Use the status consistently in workflow output.

## Response

For substantial kickoff/review output:

1. Objective
2. Input Sources
3. Refactor Classification
4. Protected Invariants
5. Planned Specialist Sequence
6. Artifacts To Be Produced
7. Recommended Next Action

For implementation close-out, also state:

- what changed;
- what behavior was intentionally preserved;
- validation performed;
- residual risks/follow-ups;
- Refactor Status.

## Source and Compatibility

`docs/ai/general/Workflow 02 - Safe Refactor Workflow.md` remains the neutral cross-tool workflow authority.

For Claude Code, this skill changes context-loading mechanics only: specialist details are delegated to their skills instead of preloaded here, while workflow sequence, protected-invariant semantics, fast-path requirements, validation obligations, and statuses remain shared.

If shared workflow semantics change, propagate that semantic change according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary refactor delivery.
