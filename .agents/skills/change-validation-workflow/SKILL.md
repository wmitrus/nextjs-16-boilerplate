---
name: change-validation-workflow
description: Determine and execute the minimum safe validation scope for one specific feature, fix, refactor, or migration when that scope is not already clear. Verify the actual changed-file set, classify validation risk through `validation-strategy`, produce explicit minimum/optional/not-required tiers, run every minimum-required check, and report Pass / Fail / Blocked with evidence. Use repository-baseline validation instead for repo-wide audits.
---

# Change Validation Workflow

Determine, execute, and report the minimum sensible validation scope for a specific change.

Optimize for strong evidence with low waste:

- enough validation to falsify the actual risk;
- no broad testing merely for ceremony;
- no completion based on a theoretical plan that was never executed.

`validation-strategy` owns risk classification and validation-scope judgment. This workflow owns change intake, handoff, execution of the approved minimum, result evidence, and final status.

## Context Loading

Inherit active repository invariants from `AGENTS.md`.

Do not preload full copies of:

- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Workflow 07 source;
- the full Validation Strategy source;
- the full `SECURITY_CODING_PATTERNS.md`;
- Architecture, Security/Auth, Runtime, or Playwright sources.

At start:

1. determine the actual task-relevant changed-file set;
2. inspect the changed code/config plus directly affected tests/validation tooling;
3. collect existing specialist constraints/evidence already available for the task;
4. ensure mandatory auth-flow sources are available only when the change is auth/bootstrap/onboarding;
5. invoke `validation-strategy` with the concise change/risk context;
6. expand specialist/security/runtime context only when the resulting scope cannot be determined safely.

Repository code/config and actual execution evidence are the source of truth.

Do not reload source material already present and current in the active task context.

## Entry Conditions

Use for:

- planning validation for a completed or in-progress implementation;
- deciding which validation layers are justified for a specific feature, fix, refactor, or migration;
- preventing over-validation of a low-risk change;
- preventing under-validation of a high-risk change;
- auth/bootstrap/onboarding changes, which require elevated scrutiny;
- a task where the validation answer must be executed and artifact-backed rather than advisory only.

Do not use for:

- repository-wide validation posture audits — use `repository-baseline-validation-workflow`;
- changes whose minimum validation scope is already clear, agreed, and ready to run;
- pure specialist review with no intent to execute validation;
- debugging an unexplained failure whose root cause is still unknown — use the appropriate investigation workflow first.

If a parent workflow already established an explicit validation plan and the only remaining work is execution, do not rerun this workflow merely to recreate the same plan; execute the owning workflow's required checks.

## Core Principles

Always:

- classify the change before prescribing validation;
- verify the real changed surface instead of trusting filenames from a prompt;
- use the smallest checks that directly exercise the changed risk;
- separate validation into:
  - minimum required;
  - optional additional;
  - explicitly not required;
- preserve mandatory repository/security checks even when the broader scope stays narrow;
- execute every minimum-required check before declaring the change safe;
- report each check independently;
- expand scope only when evidence or blast radius justifies it.

Never:

- run the full test suite by default when targeted tests close the risk;
- add broad new test suites speculatively;
- substitute a validation plan for actual execution;
- call a failed check “pre-existing” without evidence;
- mark validation complete while a minimum-required check is unrun, failed, or blocked;
- hide unresolved Architecture/Security/Runtime decisions inside a validation recommendation;
- use broad E2E to compensate for an unclear risk model.

## Changed-File Set

The validation plan must be based on the actual change.

Determine the changed surface from, as applicable:

- the current working-tree diff;
- the relevant branch diff against the intended baseline/default branch;
- files explicitly identified by the parent task/workflow;
- implementation artifacts that identify the task-owned edit set.

When the working tree contains unrelated pre-existing changes:

- do not silently absorb them into the task;
- preserve them untouched;
- distinguish task-relevant changed files from unrelated dirty files;
- validate unrelated dirty files only when they materially affect the task's execution/evidence.

If the task-owned change set cannot be separated safely from unrelated edits, report the ambiguity before risk classification.

Inspect directly affected:

- tests;
- configs;
- workflows;
- scripts;
- validation tooling;
- public/internal contracts.

Do not infer blast radius from file count alone.

## Existing Evidence Reuse

Before scheduling a check, identify validation already run in the current task/session.

A check may be placed in **not required / already satisfied** only when:

- the exact relevant check already ran against the current code state;
- the evidence is still valid after later edits;
- its scope covers the current risk.

If code changed after the check in a way that could invalidate its result, rerun it.

Do not repeat expensive checks only because another workflow normally lists them.

## Auth / Bootstrap / Onboarding Changes

For every auth/bootstrap/onboarding change, ensure current versions of:

1. `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`;
2. `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
3. `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

are available before finalizing validation scope.

If those exact current sources are already available from a parent auth-flow/security workflow in the active context, reuse them. Otherwise read them.

Requirements:

- map validation to affected matrix scenarios;
- preserve the matrix's mandatory/current minimum-required scenario semantics;
- distinguish code-level Security/Auth evidence from browser/runtime evidence;
- use `playwright-e2e` only when real-browser evidence is actually required.

If affected matrix scope or trust semantics remain unresolved, stop before validation execution and return the decision to the owning auth/security workflow rather than guessing.

## Mandatory Known Validation Contracts

These contracts are non-negotiable when applicable.

### SEC-23 — App Router UUID path segments

For an App Router route handler whose path segment is bound to a UUID-backed repository/DB operation, minimum validation must include a malformed-ID case such as:

```text
not-a-uuid
```

The evidence must prove:

- HTTP `400`;
- DB/repository/read-service call is not reached with the malformed UUID;
- mutation side effects are not reached.

Happy-path plus valid-UUID-not-found coverage is not sufficient.

### SEC-24 — Codacy HIGH Error-Prone TypeScript/JSX

Match validation to the changed code shape.

Require, when applicable:

- lint evidence for Promise-returning/async JSX handler shape;
- typecheck for sparse dynamic state or finite schema/type narrowing;
- owning unit/component test for changed UI handlers or typed mocks;
- route tests when request-schema narrowing changes parsing/acceptance.

Do not apply every SEC-24 check to every finding mechanically; require the checks corresponding to the actual changed shape.

Do not accept a scanner quick fix that removes absence handling such as `?.` / `??` unless presence is proven before read.

## Workflow Sequence

### 1. Change Intake

Determine and record:

- objective of the change;
- task-relevant changed files;
- unrelated dirty files, if materially relevant to evidence;
- affected modules/layers/contracts;
- existing tests/coverage touching the changed behavior;
- configs/workflows/tooling affected;
- specialist constraints already available;
- validation already run against the current code state;
- auth-flow matrix requirement when applicable.

For artifact-backed work, update the workflow validation artifact/control state rather than creating duplicate change-intake artifacts owned by another workflow.

Required output:

- changed files considered;
- directly affected validation surfaces;
- known constraints/evidence;
- unresolved scope ambiguity.

If the changed surface is too ambiguous to classify, stop.

### 2. Validation Risk Assessment

Invoke `validation-strategy`.

Provide a concise handoff containing:

- change objective;
- actual changed-file set;
- affected behavior/contracts;
- known specialist constraints;
- existing coverage;
- already-run valid evidence;
- auth matrix scenario obligations when applicable;
- relevant SEC-ID(s) when already known;
- likely runtime/architecture/security risk dimensions.

Require explicit risk assessment across relevant dimensions:

- auth/trust/tenancy;
- architecture/boundary/DI;
- routing/server-client/cache/runtime;
- data/schema/database behavior;
- public/API contract;
- coverage gaps;
- deployment/env/build lifecycle where applicable.

The specialist must state the change risk before prescribing checks.

If risk classification depends on unresolved Architecture, Security/Auth, or Runtime authority:

- stop;
- do not invent a validation scope;
- identify the owning specialist decision required.

### 3. Validation Scope Definition

Produce exactly three tiers.

#### Minimum Required

Checks that must pass before the change is considered validated.

Every item must state:

- concrete risk it falsifies;
- exact command/check/scenario;
- expected evidence;
- why a narrower check would be insufficient, when non-obvious.

Include applicable mandatory repository contracts such as SEC-23/SEC-24.

#### Optional Additional

Checks that add useful confidence but are not required for safety/closure.

State the risk or uncertainty they would reduce.

Do not put a check here merely because it is commonly available.

#### Not Required

Explicitly excluded checks/layers.

Use this tier to prevent waste.

For each material exclusion, state why it does not exercise the changed risk or why current valid evidence already satisfies it.

Examples may include:

- unrelated test layers;
- broad E2E when focused route/integration proof is stronger;
- full-suite reruns without blast-radius justification;
- checks already validly executed against the unchanged current state.

### Scope Expansion

Do not expand test scope automatically.

A materially broader test-suite addition or broad validation recommendation requires a concrete risk justification from `validation-strategy`.

If the risk classification remains unclear or contested, stop instead of resolving uncertainty through “run everything.”

## 4. Validation Execution

Run every Minimum Required item.

Execution rules:

- prefer focused commands first;
- use repository-owned scripts/scenario runners over improvised raw commands when those scripts own setup/runtime semantics;
- preserve exact command and exit status;
- retain the smallest relevant output needed to prove Pass/Fail/Blocked;
- use durable logs/reports by reference instead of pasting huge output;
- do not alter production code merely to make a validation command pass.

For each minimum check record:

- check ID/name;
- risk addressed;
- exact command or manual verification;
- code/runtime state tested;
- exit code when a command ran;
- relevant result/evidence;
- status:
  - **Pass**
  - **Fail**
  - **Blocked**

### Manual / non-command checks

A non-command check is valid only when the required evidence is inherently manual/runtime/external and the observed evidence is recorded.

Do not replace an executable minimum check with prose.

### Failure handling

If a minimum check fails:

- record the failure exactly;
- determine whether evidence proves it is:
  - newly introduced;
  - confirmed pre-existing;
  - uncertain origin;
- do not mark validation complete.

If failure origin is unclear and materially affects closure, overall status is **Blocked** or **Fail** according to the observed state; do not hand-wave it.

### Blocked execution

Use **Blocked** when a minimum check cannot be executed because required tooling/environment/preconditions are unavailable or an owning specialist decision is unresolved.

State the smallest concrete action that would unblock it.

## 5. Result Report

Overall status is exactly one:

- **Pass**
- **Fail**
- **Blocked**

### Pass

Allowed only when:

- every Minimum Required check passed;
- no unresolved specialist decision invalidates the validation model;
- mandatory auth/security scenario evidence is satisfied when applicable.

Optional checks do not block Pass unless evidence discovered during the run reclassifies them as required.

### Fail

Use when:

- one or more minimum checks executed and demonstrated behavior inconsistent with required expectations.

### Blocked

Use when:

- required validation could not be executed;
- change scope is too ambiguous;
- validation depends on unresolved specialist authority;
- evidence is insufficient to distinguish whether closure conditions are satisfied.

Report:

- result per minimum check;
- optional checks run, if any;
- not-required checks;
- failing/blocked details;
- remaining gaps;
- recommended next action.

## Artifact-Backed Work

When this workflow is actually run as Workflow 07 for `.copilot/tasks/{task_id}/`, preserve its five-step artifact contract:

```text
change-intake.md
validation-risk.md
validation-scope.md
validation-execution.md
validation-report.md
```

Each file is updated for its owning step:

### `change-intake.md`

Record:

- task-relevant changed-file set;
- directly affected tests/configs/workflows/tooling;
- user/parent risk notes;
- auth-matrix reference when applicable;
- unrelated dirty-tree ambiguity only when it affects evidence.

### `validation-risk.md`

Record the `validation-strategy` result:

- change risk classification;
- relevant risk dimensions;
- unresolved specialist decisions/blockers.

`validation-strategy` also maintains its one persistent:

```text
05 - Validation Strategy - Summary.md
```

according to the specialist artifact contract. The Workflow 07 `validation-risk.md` is the workflow-step artifact, not a replacement for that persistent specialist summary.

### `validation-scope.md`

Record exactly:

- Minimum Required;
- Optional Additional;
- Not Required;

including concrete risk, command/check/scenario, and evidence expectation.

### `validation-execution.md`

Record:

- every minimum-required command/check;
- exact command strings;
- exit codes where applicable;
- concise relevant evidence;
- per-check Pass / Fail / Blocked.

### `validation-report.md`

Consolidate:

- overall Pass / Fail / Blocked;
- failed/blocked checks;
- remaining gaps;
- recommended next action.

When a parent Orchestrator owns top-level lifecycle, do not duplicate its `plan.md`, `intake.md`, or other control artifacts. Workflow 07 still owns the five phase artifacts above when this workflow is actually invoked.

If the parent workflow does **not** invoke Workflow 07 and already owns a complete explicit validation plan/execution artifact contract, do not instantiate Workflow 07 merely to create these files.

Keep parent control/task state synchronized only when validation changes required scope, status, or closure conditions.

Reference durable command logs/reports instead of duplicating large raw output.

Do not create parallel or duplicate Workflow 07 phase artifacts for the same logical validation run.

## Block Conditions

Stop and report before or during execution when:

- the task-relevant changed-file set cannot be determined safely;
- validation scope depends on unresolved Architecture/Security/Auth/Runtime decisions;
- auth-flow scenario obligations are unresolved;
- a materially expanded test plan has no concrete risk justification;
- a minimum-required check cannot be executed;
- a minimum-required failure has unclear origin and blocks a reliable closure decision.

Do not convert a block into a broad “run everything” fallback.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions. Reaching
Pass / Fail / Blocked completes the current validation run, but does not by
itself mean the tracked Linear issue should be marked Done — a Fail/Blocked
outcome requiring in-scope follow-up keeps the issue open for that follow-up
rather than closing and reopening it.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

## Response

For substantial output, use exactly:

1. Objective
2. Mode — `change-validation`
3. Changed Files Considered
4. Current-State Findings
5. Validation-Risk Assessment
6. Recommended Validation Scope
   - Minimum Required
   - Optional Additional
   - Not Required
7. Validation Commands or Checks
8. Result per Check
9. Recommended Next Action

Lead with failed/blocked checks when the result is not Pass.

Every Pass/Fail/Blocked conclusion must be traceable to live code, an executed check, or recorded runtime evidence.

## Source and Compatibility

`docs/ai/general/Workflow 07 - Change Validation Workflow.md` remains the neutral cross-tool workflow authority.

`validation-strategy` remains the specialist authority for change-risk classification and the minimum/optional/not-required scope.

For Codex, this skill changes context-loading and evidence-reuse mechanics only. It preserves actual changed-set verification, risk-first scope definition, the three validation tiers, mandatory SEC-23/SEC-24 contracts, auth-flow matrix scrutiny, execution of every minimum-required check, per-check evidence, and overall Pass / Fail / Blocked status.

If shared Workflow 07 semantics change, propagate the semantic change according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary change validation.
