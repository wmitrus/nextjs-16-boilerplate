---
name: incident-investigation-workflow
description: Evidence-first investigation-to-remediation workflow for production failures, regressions, intermittent/environment-driven failures, and unclear multi-layer bugs where root cause or safe fix scope is not yet clear. Always starts with `debug-investigation`, routes Runtime/Architecture only when evidence justifies them, requires an explicit remediation plan and validation strategy before implementation, then validates the narrow fix. Reclassify known trust-boundary/security incidents to `security-incident-workflow`.
---

# Incident Investigation Workflow

Investigate and remediate production incidents, regressions, and multi-layer failures through a controlled evidence-first sequence.

The workflow exists to reduce ambiguity before code changes, route only the specialists justified by evidence, keep remediation low-blast-radius, and prove the fix before closure.

It is not a generic debugging-only mode and it is not the security-incident workflow.

## Context Loading

Inherit active repository invariants from `AGENTS.md`.

Do not preload full copies of:

- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Workflow 04 source;
- Debug Investigation, Runtime, Architecture, Validation, or Implementation source files;
- the full Security Coding Patterns catalogue.

At start:

1. normalize the incident evidence already supplied;
2. inspect only live repository/runtime surfaces needed to understand the initial failure path;
3. invoke `debug-investigation` first;
4. let Debug Investigation perform targeted evidence expansion;
5. invoke Runtime/Architecture only if Debug/remediation evidence triggers them;
6. invoke `validation-strategy` after the remediation scope is confirmed;
7. let every specialist own its targeted context loading.

Do not reload sources already current and available in the active task context.

Evidence hierarchy:

1. actual runtime/reproduction output for what happened;
2. live code/config for ownership and current behavior;
3. focused diagnostics/tests for falsification;
4. docs/history as supporting evidence.

If docs conflict with live code/config, record the drift instead of letting stale wording override the current implementation.

## Entry Conditions

Use for:

- production failures/regressions with unclear root cause;
- intermittent or environment-dependent failures;
- failures spanning routing, auth flow, caching, runtime, modules, or multiple layers;
- incidents where the correct specialist is not obvious initially;
- confirmed bugs where the root cause may be understood but safe remediation scope still needs controlled multi-layer review.

Do not use for:

- a known bug with an already-clear minimal safe fix — use `implementation-agent`;
- a known trust-boundary/security vulnerability — use `security-incident-workflow`;
- a read-only architecture audit;
- standalone ambiguous exploration where no remediation is expected yet — use `debug-investigation`;
- a validation-only task after the fix is already complete.

This workflow always includes remediation intent.

## Core Principles

Always:

- gather evidence before committing to a diagnosis;
- run Debug Investigation first;
- trace the real execution/data/state path;
- distinguish observed facts from hypotheses;
- rank hypotheses only after enough evidence exists to support them;
- route specialists only when evidence justifies their domain;
- confirm root cause before implementation;
- produce an explicit remediation plan before implementation;
- keep fix scope narrow;
- preserve architecture/runtime/security invariants;
- update/add tests when behavior changes;
- validate the implemented remediation before closing.

Never:

- diagnose from symptoms alone;
- implement while root cause remains materially ambiguous;
- run every specialist by default;
- let Implementation invent architecture/runtime/security policy;
- hide uncertainty in code changes;
- broaden into redesign without evidence and approval;
- use a broad test run as a substitute for understanding the failure.

## Security Reclassification

At incident intake and throughout investigation, check whether evidence reveals:

- authorization bypass;
- tenant/resource-scope breach;
- credential/token exposure;
- sensitive-data exposure;
- trust-boundary failure;
- another real security vulnerability requiring Security/Auth-first remediation.

If yes:

1. stop this workflow before remediation implementation;
2. preserve gathered evidence/artifacts;
3. reclassify to `security-incident-workflow`;
4. hand off the confirmed evidence/root-cause state;
5. do not nest both workflows as competing owners.

An auth-routing/bootstrap/onboarding failure is not automatically a security incident. Reclassify only when the actual security/trust boundary is implicated.

## Auth / Bootstrap / Onboarding Incidents

When the incident touches auth/bootstrap/onboarding behavior but has not been reclassified as a security incident, ensure current versions of:

1. `AUTH_FLOW_ANTI_PATTERNS.md`;
2. `AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
3. `AUTH_FLOW_VERIFICATION_MATRIX.md`

are available for the affected flow.

Reuse current copies already loaded into the active task context when available.

Use the matrix to:

- identify scenario IDs affected by the failure/remediation;
- preserve expected passing paths;
- define required post-fix evidence.

Do not claim final matrix sign-off inside investigation unless the owning auth-flow workflow actually owns that sign-off.

If investigation reveals trust ambiguity, stop and reclassify to the appropriate security/auth workflow rather than guessing.

## Workflow Sequence

### 1. Incident Intake

Normalize:

- symptom;
- environment: dev/staging/production or other actual target;
- reproduction steps, including partial reproduction;
- consistency/intermittency;
- affected user flow;
- logs/errors/screenshots/traces;
- known recent changes;
- suspected areas, clearly marked as suspicions;
- constraints/non-goals;
- evidence gaps.

Classify the initial route:

- general incident → continue;
- security incident → stop and switch to `security-incident-workflow`.

Do not manufacture missing facts.

If information is incomplete, Debug Investigation owns evidence gathering where repository/runtime tooling can resolve it.

Required output:

- normalized incident description;
- environment/reproduction context;
- known evidence;
- initial affected-area hypothesis;
- security/general routing decision.

### 2. Debug Investigation — Always

Invoke `debug-investigation`.

Required handoff:

- normalized symptom;
- environment/reproduction;
- available logs/runtime evidence;
- affected flow;
- recent-change evidence;
- known constraints;
- explicit unknowns.

Require Debug Investigation to:

1. trace the actual execution path;
2. identify entry points;
3. identify state transitions;
4. inspect identity/tenant context when relevant;
5. inspect redirect/routing flow when relevant;
6. correlate logs/runtime evidence with live code;
7. locate likely divergence points;
8. produce ranked hypotheses supported by evidence;
9. falsify alternatives where practical;
10. classify likely domain involvement:
    - runtime;
    - architecture;
    - security;
    - application/domain logic;
    - combination;

11. recommend only the next specialists justified by evidence.

Do not proceed merely because one plausible hypothesis exists.

Required output:

- execution path trace;
- evidence gathered;
- divergence point(s);
- ranked hypotheses;
- confirmed/remaining unknowns;
- recommended specialist routing.

If the incident is still too ambiguous to produce a safe remediation scope, remain in investigation and report the block. Do not implement.

### 3. Conditional Next.js Runtime Review

Invoke `nextjs-runtime` only when Debug evidence points to current Next.js/runtime behavior involving, for example:

- App Router semantics;
- Server/Client placement;
- Route Handlers;
- Server Actions;
- `src/proxy.ts`;
- redirects;
- caching/revalidation;
- request/build-time behavior;
- Node/runtime/deploy assumptions.

Require:

- relevant runtime mechanism;
- live config/runtime evidence;
- whether runtime semantics explain/contribute to the failure;
- remediation constraints;
- stop/go/block.

Do not route Runtime merely because the application uses Next.js.

Current live Next.js configuration wins over stale Middleware/Edge/cache documentation.

### 4. Conditional Architecture Guard Review

Invoke `architecture-guard` only when the proposed remediation:

- changes module ownership/boundaries;
- affects dependency direction;
- affects DI/composition;
- introduces/removes cross-module dependencies;
- changes contracts/public seams;
- risks structural coupling/regression.

Require:

- architecture fit of the proposed fix;
- allowed structural shape;
- forbidden shortcuts;
- DI/contract implications;
- stop/go/block.

Do not run Architecture for a clearly local implementation fix with no structural implication.

### 5. Remediation Plan

Consolidate evidence from:

- Debug Investigation;
- Runtime, when run;
- Architecture, when run;
- auth matrix constraints, when applicable.

The remediation plan must state:

- **confirmed root cause**;
- evidence supporting that root cause;
- specific change scope;
- affected files/logic;
- expected behavior change;
- risks introduced by the fix;
- explicitly allowed changes;
- explicitly forbidden changes;
- protected invariants;
- tests/evidence that must change or be added;
- remaining uncertainties.

Do not proceed to implementation when:

- root cause is not confirmed;
- remediation scope is still ambiguous;
- Runtime or Architecture has a Blocked result;
- required security reclassification is unresolved;
- fix scope exceeds low-blast-radius work without approval.

Do not convert a ranked hypothesis into “confirmed root cause” without confirming evidence.

### 6. Validation Strategy

Current repository runtime surfaces for Workflow 04 include an explicit Validation Strategy phase even though the older neutral Workflow 04 text omits it. Preserve the current runtime workflow behavior.

Invoke `validation-strategy` after the remediation plan is stable and before implementation.

Provide:

- confirmed root cause;
- exact proposed change scope;
- affected behavior/contracts;
- Runtime/Architecture constraints;
- auth matrix obligations when applicable;
- existing relevant coverage/evidence.

Require exactly:

- change risk classification;
- Minimum Required validation;
- Optional Additional validation;
- Validation Not Required;
- concrete commands/checks/scenarios.

The plan must remain proportional to incident/fix risk.

Do not expand to full-suite/E2E validation without a concrete risk reason.

### 7. Implementation

Invoke `implementation-agent` only after:

- root cause is confirmed;
- remediation plan is explicit;
- Runtime/Architecture constraints are resolved when applicable;
- validation minimum is established.

Provide:

- confirmed root cause/evidence;
- remediation plan;
- allowed/forbidden scope;
- Runtime constraints;
- Architecture constraints;
- required validation plan.

Require:

- smallest safe change;
- inspect affected live files before editing;
- no unrelated cleanup/refactor;
- no redesign beyond approved remediation;
- preserve protected invariants;
- update tests when behavior changes;
- report unexpected drift/uncertainty rather than improvising.

If implementation evidence invalidates the root-cause/remediation model:

- stop implementation;
- return to investigation/remediation planning;
- do not force the original plan through.

### 8. Validation

Execute the approved Minimum Required validation from `validation-strategy`.

Use repository-owned scripts/scenario runners where they own setup/runtime semantics.

At minimum, the validation plan should consider the neutral Workflow 04 expectations:

- targeted affected-area tests first;
- typecheck;
- lint;
- architecture lint when boundaries were touched;
- broader tests only when blast radius justifies them.

The current Validation Strategy result decides the actual blocking minimum.

For each required check record:

- exact command/check;
- risk addressed;
- exit code when applicable;
- concise relevant evidence;
- Pass / Fail / Blocked.

Never classify a failure as pre-existing without evidence.

If a fix is auth/bootstrap/onboarding-sensitive, map required validation back to affected matrix scenario IDs.

If validation fails:

- do not close the incident as remediated;
- state whether evidence points to implementation defect, invalid remediation model, confirmed pre-existing issue, or uncertain origin;
- route back to the appropriate phase.

## Artifact Contract

When Workflow 04 is actually run for `.copilot/tasks/{task_id}/`, preserve the current eight-step execution contract:

```text
incident-intake.md
flow-trace.md
runtime-review.md
architecture-review.md
remediation-plan.md
validation-strategy.md
implementation-report.md
validation-report.md
```

### `incident-intake.md`

Record:

- symptom;
- environment;
- reproduction;
- evidence/log references;
- affected flow;
- security/general routing decision.

### `flow-trace.md`

Record:

- entry points;
- execution/state transitions;
- identity/tenant context when relevant;
- redirect/routing flow when relevant;
- divergence points;
- evidence;
- ranked hypotheses;
- remaining unknowns.

### `runtime-review.md`

This workflow-step artifact is mandatory because the current execution-layer contract defines an output for every step.

When Runtime is required, record:

- runtime surface classification;
- live runtime/config facts;
- runtime constraints;
- stop/go/block.

When Runtime is not required, still create/update `runtime-review.md` with a concise:

- `Not required`;
- evidence-based reason the Runtime specialist was skipped;
- confirmation that no runtime constraint is being invented.

Do not fabricate a Runtime analysis merely to populate the artifact.

### `architecture-review.md`

This workflow-step artifact is mandatory because the current execution-layer contract defines an output for every step.

When Architecture is required, record:

- architecture fit;
- boundary/DI/contract constraints;
- stop/go/block.

When Architecture is not required, still create/update `architecture-review.md` with a concise:

- `Not required`;
- evidence-based reason the Architecture specialist was skipped;
- confirmation that no architecture constraint is being invented.

Do not fabricate an Architecture review merely to populate the artifact.

### `remediation-plan.md`

Record:

- confirmed root cause + evidence;
- exact fix scope;
- expected behavior;
- risks;
- allowed/forbidden changes;
- protected invariants;
- unresolved risks.

### `validation-strategy.md`

Record the Workflow 04 validation-phase result:

- risk classification;
- minimum required;
- optional additional;
- not required;
- commands/checks/scenarios.

`validation-strategy` also maintains its persistent specialist summary according to its own artifact contract. The workflow step artifact does not replace that specialist summary.

### `implementation-report.md`

Record:

- files changed;
- logic changes;
- tests changed;
- deviations from remediation plan;
- unresolved implementation uncertainty.

`implementation-agent` also maintains its persistent specialist summary when artifact-backed.

### `validation-report.md`

Record:

- checks executed;
- result per check;
- overall validation state;
- residual risks;
- follow-up/re-entry phase if not closed.

When `workflow-orchestrator` owns the task:

- it owns `plan.md`, `intake.md`, and top-level lifecycle;
- do not duplicate those artifacts;
- update their state only when this workflow changes phase/status/closure conditions.

Specialist skills maintain their own one persistent summary files. Do not create duplicate role summaries.

## Block Conditions

Stop before implementation when:

- root cause remains ambiguous;
- remediation scope is not explicit;
- Runtime/Architecture constraints are unresolved;
- incident requires security reclassification;
- requested fix exceeds low-blast-radius scope without approval;
- validation minimum cannot be defined safely.

Stop before closure when:

- required validation failed;
- required validation is blocked/unrun;
- auth matrix evidence remains required and unresolved;
- implementation changed the failure model without renewed investigation.

In a blocked state state:

- exact blocker;
- supporting evidence;
- owning specialist/phase;
- smallest next action that removes the block.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions; investigation/
remediation/validation re-entry uses the same tracked Linear issue rather than
creating another. A Blocked or failed-validation run that requires in-scope
follow-up does not by itself mark the issue Done.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

## Response

For substantial workflow output use exactly:

1. Objective
2. Incident Classification
3. Evidence and Reproduction State
4. Execution Path / Divergence
5. Root-Cause State
6. Conditional Runtime Review
7. Conditional Architecture Review
8. Remediation Plan
9. Validation Strategy
10. Implementation State
11. Validation Result
12. Residual Risks / Blocks
13. Recommended Next Action

Omit detailed conditional specialist content when correctly not run, but explicitly state `Not required` and why.

Every root-cause, remediation, and closure claim must be traceable to evidence.

## Source and Compatibility

`docs/ai/general/Workflow 04 - Incident Investigation Workflow.md` remains the neutral workflow intent authority.

The established runtime surfaces and `.zenflow/workflows/incident-investigation.md` include a Validation Strategy phase not yet reflected in the older neutral Workflow 04 text. Preserve that established runtime sequence and record this documentation drift rather than silently removing the phase.

`.zenflow/workflows/incident-investigation.md` remains the current execution-layer artifact contract reference.

For Codex, this skill changes context-loading mechanics and delegation detail while preserving evidence-first Debug Investigation, conditional specialist routing, explicit remediation before implementation, current Validation Strategy phase, low-blast-radius implementation, and post-fix validation.

If shared Workflow 04 semantics are updated, reconcile the runtime surfaces through the repository's agent-infrastructure propagation rules. Do not load propagation documentation during ordinary incident work.
