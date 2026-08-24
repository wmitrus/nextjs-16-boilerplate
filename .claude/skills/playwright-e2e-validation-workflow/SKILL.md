---
name: playwright-e2e-validation-workflow
description: Focused real-browser verification workflow for task-driven scenarios, matrices, acceptance lists, and workflow artifact packages. Use when browser evidence is required and the scenarios are not already validly verified in the current code/runtime state. Delegate Playwright runtime, fixture, auth-state, and runner details to `playwright-e2e`; preserve the six Workflow 06 artifacts, explicit test/defer/skip scope, precondition gating, per-scenario evidence, and gap reporting.
---

# Playwright E2E Validation Workflow

Execute focused real-browser Playwright verification for the current task.

This workflow owns:

- verification intake;
- scenario-scope decisions;
- precondition gating;
- workflow artifact continuity;
- per-scenario status/evidence mapping;
- gap reporting and workflow-level sign-off.

`playwright-e2e` owns:

- repository Playwright runtime semantics;
- scenario-runner/package selection;
- fixture taxonomy;
- auth/storage-state decisions;
- Clerk/AuthJS E2E setup;
- E2E spec/helper maintenance;
- browser evidence collection mechanics.

Do not duplicate the full Playwright specialist knowledge inside this workflow.

## Context Loading

Inherit active repository invariants from `CLAUDE.md`.

Do not preload full copies of:

- `AGENTS.md`;
- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- the neutral Workflow 06 source;
- the neutral Playwright E2E Agent source;
- full E2E Architecture;
- the full Security Coding Patterns catalogue;
- auth-flow corpus for non-auth work.

At workflow start:

1. read the task/scenario source that defines what must be verified;
2. read only relevant active task artifacts when they exist;
3. identify affected paths/flows and environment/provider notes;
4. invoke `playwright-e2e` for repository-specific scenario classification, runtime, fixture, and command selection;
5. load auth-flow sources only for actual auth/bootstrap/onboarding verification;
6. load E2E Architecture only when adding, moving, refactoring, or changing shared fixture/auth setup;
7. reuse valid browser evidence already produced against the same current code/runtime state.

Repository code/runtime evidence is authoritative for actual behavior.

The task scenario list, matrix, acceptance list, or verification document is authoritative for what must be verified.

## Entry Conditions

Use when browser-level evidence is required for:

- redirects;
- cookies/session behavior;
- auth/bootstrap/onboarding;
- route transitions;
- hydration;
- browser navigation;
- post-implementation browser verification of a fix;
- scenario-matrix entries that cannot be proven by code/integration tests alone.

Do not use when:

- focused unit/integration/API validation fully covers the risk;
- browser evidence is not part of the acceptance/verification requirement;
- the same required scenarios were already validly verified in the current session against the same relevant code/runtime state;
- the main task is implementation/design rather than verification;
- broad repository Playwright posture is being audited rather than task scenarios.

If prior Playwright evidence exists, reuse it only when:

- the relevant code/config has not changed since the run;
- the same runtime/provider/environment semantics apply;
- the scenario and expected outcome are the same;
- the evidence is concrete enough for current sign-off.

If any of those are false, rerun the affected scenario.

## Core Principles

Always:

- define the smallest scenario scope before execution;
- classify each scenario into the repository E2E architecture through `playwright-e2e`;
- list scenarios to test, defer, and skip explicitly;
- state expected outcome for every scenario under test;
- run a precondition check before browser execution;
- use repository-owned scenario/package commands when they own environment/runtime setup;
- collect concrete evidence per scenario;
- map every in-scope scenario to an explicit result;
- produce a gap report even when there are no gaps.

Never:

- run the whole Playwright suite by default;
- use raw Playwright as authoritative sign-off where the repository scenario runner/package owns setup semantics;
- force one auth fixture model across mixed scenario semantics;
- replace browser evidence with code-review inference;
- claim “all tests passed” without scenario-level mapping;
- mark required behavior verified when the scenario was not actually checked or validly deferred/blocked;
- modify production code to make browser validation pass.

## Scenario Sources

Possible verification sources include:

- explicit user scenario list;
- task brief acceptance scenarios;
- workflow artifact checklist;
- auth-flow verification matrix;
- security/remediation verification requirements;
- named existing Playwright specs;
- another authoritative task-specific acceptance list.

When no explicit scenario list exists but browser verification is clearly required:

1. derive a minimal scenario list from the task/acceptance requirements;
2. label it as derived;
3. state the source requirement for each scenario;
4. do not invent extra coverage merely because Playwright is available.

## Auth / Bootstrap / Onboarding Verification

For actual auth/bootstrap/onboarding verification, ensure current versions of:

1. `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`;
2. `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`;
3. `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

are available.

If a parent auth/security workflow already loaded the exact current corpus into the active task context, reuse it.

Otherwise read the required sources before scope definition.

Requirements:

- preserve authoritative AF scenario IDs;
- map the changed/affected auth paths to those IDs;
- preserve the matrix's current minimum-required obligations;
- distinguish browser-verifiable scenarios from code/security-only evidence;
- do not infer PASS for scenarios that require browser/runtime proof.

Use:

```text
docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md
```

for the auth verification run evidence structure.

Do not create a redundant seventh Workflow 06 artifact merely for that template:

- if a parent auth workflow defines a canonical run artifact such as its matrix-verification artifact, update that parent-defined artifact as required;
- otherwise structure Workflow 06's `evidence-report.md` using the auth verification run template;
- the six Workflow 06 step artifacts still remain required.

For generic Workflow 06 reporting, use the generic Pass / Fail / Blocked result model plus explicit deferred/skipped scope.

For auth-matrix reporting, preserve the governing auth matrix/template vocabulary such as PASS / FAIL / DEFERRED / BLOCKED where required. Do not collapse an approved DEFERRED state into PASS.

## E2E Scenario Classification

Before choosing commands or fixtures, `playwright-e2e` classifies each scenario as:

- public / unauthenticated;
- interactive auth transition;
- steady-state authenticated;
- mixed matrix coverage.

The workflow records the resulting classification but does not recreate fixture policy.

Key workflow constraints:

- public/demo routes remain unauthenticated unless authenticated behavior is the subject;
- transition-sensitive auth scenarios remain fresh interactive flows;
- steady-state shared authenticated state is allowed only after auth/bootstrap/onboarding has settled;
- mixed semantics are split rather than forced into one fixture model.

If the fixture model is uncertain, the workflow is not ready for execution until `playwright-e2e` resolves it from current route/runtime policy.

## E2E Coverage Changes

This workflow is primarily verification.

Only edit/add E2E specs, helpers, fixtures, or setup when the task/user explicitly includes E2E coverage/setup changes. A failed or blocked verification run by itself is not permission to modify E2E code.

When E2E coverage/setup changes are explicitly in scope:

- `playwright-e2e` must load `docs/usage/05 - Playwright E2E Architecture.md`;
- apply the specialist's targeted E2E security rules;
- keep changes limited to E2E test/helper/setup surfaces;
- do not change production behavior under this workflow;
- validate the E2E-only change before using it as verification evidence.

If a required scenario cannot run because existing E2E support is insufficient and E2E code changes are not explicitly in scope:

- record the scenario as Blocked;
- report the E2E-support gap;
- state the smallest E2E-only follow-up needed;
- do not silently implement that follow-up.

If browser execution discovers a production defect:

1. record the scenario as Fail or Blocked as appropriate;
2. capture evidence;
3. hand the defect to the owning implementation/security/runtime workflow;
4. rerun verification only after the fix;
5. do not weaken assertions, skip the scenario, or mock away the production defect.

## Workflow Sequence

### 1. Verification Intake

Collect:

- objective;
- task context;
- scenario/checklist source;
- affected URL paths/flows;
- environment/provider/runtime notes;
- existing browser evidence;
- relevant task constraints;
- whether E2E code/setup changes are needed.

For active task workspaces, read only the relevant current artifacts, typically:

- `plan.md`;
- `intake.md`;
- `constraints.md`;
- `implementation-plan.md`;

when present and relevant.

Do not read every task artifact by default.

Required output:

- verification objective;
- authoritative scenario source;
- affected paths/flows;
- environment constraints;
- relevant prior evidence;
- E2E coverage-change flag.

### 2. Scenario Scope Definition

Invoke/use `playwright-e2e` to identify the smallest repository-valid Playwright scope.

For every candidate scenario classify exactly one scope state:

- **Test**
- **Defer**
- **Skip**

For **Test**, record:

- scenario ID/description;
- E2E architecture classification;
- expected outcome;
- why browser evidence is needed;
- intended repository scenario/package/spec scope.

For **Defer**, record:

- scenario ID/description;
- explicit reason;
- whether deferral is allowed by the governing task/matrix;
- what evidence/precondition is still needed.

For **Skip**, record:

- scenario ID/description;
- why it is outside current browser-verification scope or already validly satisfied elsewhere.

Do not use Skip to hide a required scenario.

Do not use Defer merely because a scenario is inconvenient or failing.

### 3. Precondition Check

Confirm the prerequisites required by the **selected repository-owned Playwright execution path**.

Do not assume a manually running development server is required when the scenario runner/package owns server startup.

Check, as applicable:

- selected scenario/package command can establish the required app/runtime;
- explicit browser-test origin/runtime profile;
- `PLAYWRIGHT_TEST_BASE_URL` only when a non-default origin is intentionally required;
- provider/runtime mode;
- required auth credentials/test-user state;
- DB/container/seed prerequisites;
- fixture/setup capability;
- required environment variables are present without exposing values;
- no stale browser/session state invalidates an interactive-transition scenario.

The Playwright specialist's current runtime contract is authoritative.

For current repository defaults, record the actual origin selected by the runner; do not accidentally substitute normal dev origin `3000` for the E2E default `3100`.

Precondition result is exactly:

- **Ready**
- **Blocked**

If Blocked:

- do not execute browser scenarios;
- record each affected required scenario as Blocked in `preconditions.md` and the current workflow response/control state;
- state the unmet precondition and smallest unblock action.

### 4. Playwright Execution

Only when preconditions are Ready.

Run the smallest repository-valid scope selected by `playwright-e2e`.

Prefer:

- the authoritative scenario runner;
- repository package scripts built on the runner;
- targeted spec/grep only when valid for that scenario family.

Do not use broad `playwright test` merely for convenience.

For interactive CLI debugging/evidence, use the specialist's reporter requirement.

Capture:

- exact command;
- scenario/provider/runtime profile;
- browser/project;
- explicit origin;
- final URL;
- key console/server/network observations;
- report/trace path;
- screenshot path when useful;
- exit/result state.

Do not duplicate huge logs into artifacts; reference durable paths and keep only decisive excerpts.

### 5. Evidence Collection

For every **Test** scenario record:

- scenario ID/description;
- expected outcome;
- actual outcome;
- result:
  - **Pass**
  - **Fail**
  - **Blocked**
- final URL when relevant;
- decisive log/runtime/network evidence;
- trace/report/screenshot reference;
- command/run reference.

Do not mark inferred behavior Pass.

Summary counts must include:

- passed;
- failed;
- blocked.

For auth matrix runs, additionally preserve DEFERRED entries that were explicitly deferred before execution and use the auth run template semantics.

### 6. Gap Report

Always produce the gap report.

List separately:

- deferred scenarios;
- blocked scenarios;
- skipped scenarios when they are material to understanding coverage.

For each deferred/blocked scenario state:

- ID/description;
- reason/blocker;
- whether it prevents final sign-off;
- what is required to verify it;
- owning next phase/workflow when known.

If there are no gaps, state explicitly:

```text
All in-scope scenarios were verified; no deferred or blocked scenarios remain.
```

Do not use “no gaps” while a required scenario is skipped.

## Sign-Off Rules

Workflow 06 does not invent a new global status vocabulary.

State whether required browser verification is complete, incomplete, or blocked from the scenario evidence, while preserving any exact overall-result vocabulary defined by the governing parent workflow, matrix, or verification template.

Browser verification can be treated as complete only when every required in-scope scenario:

- Passed; or
- has an explicitly allowed deferred/blocked disposition under the governing source without claiming that the behavior itself passed.

If the task's completion criteria require actual browser proof, a deferred/blocked required scenario means browser verification is not complete.

Browser verification is not complete when any required scenario:

- Failed;
- is Blocked without an accepted disposition;
- was skipped without authority;
- lacks concrete browser evidence.

When only a subset is verified, distinguish that subset explicitly rather than inventing an overall PASS.

For auth verification, preserve the overall-result vocabulary defined by `AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` or the owning auth workflow.

## Failure and Re-entry

### Scenario Fail

When browser evidence shows a real production failure:

- record Fail;
- capture evidence;
- stop claiming verification;
- hand off to the owning remediation workflow;
- rerun only the affected required scenarios after the fix, plus any regression scenario justified by the change.

### Precondition Block

When the environment/setup blocks execution:

- do not change production code;
- report Blocked;
- identify the smallest unblock action;
- resume the same workflow/task after the precondition is restored.

### E2E-helper/setup gap

When an E2E-only helper cannot represent a required valid scenario:

- if E2E coverage/setup changes are explicitly in scope, `playwright-e2e` may apply the smallest E2E-only fix within its established boundary, validate it, then execute the scenario;
- otherwise record Blocked and hand off the E2E-support follow-up instead of editing;
- if fixing the gap would change normal production behavior, stop and hand off regardless.

## Artifact Contract

When Workflow 06 progresses through all six steps for `.copilot/tasks/{task_id}/`, its workflow-step artifacts are:

```text
verification-intake.md
scenario-scope.md
preconditions.md
playwright-execution.md
evidence-report.md
gap-report.md
```

Each executed workflow step must create/update its defined artifact.

If `Precondition Check` is Blocked, stop the workflow before Playwright Execution exactly as the execution-layer contract requires:

- `preconditions.md` records the blocker and unblock action;
- do not create/update `playwright-execution.md`, `evidence-report.md`, or `gap-report.md` as though those later steps executed;
- report the blocked required scenarios and next action in the current workflow response/control state;
- on resume, continue the same workflow/task and produce later artifacts only when their steps actually run.

Do not fabricate evidence artifacts for steps that did not execute.

### `verification-intake.md`

Record:

- objective/context;
- authoritative scenario source;
- affected flows/paths;
- environment/provider constraints;
- prior valid evidence;
- whether E2E coverage/setup changes are needed.

### `scenario-scope.md`

Record:

- Test / Defer / Skip table;
- architecture classification;
- expected outcome;
- selected minimal execution scope;
- justification for deferrals/skips.

### `preconditions.md`

Record:

- selected runtime/scenario family;
- required preconditions;
- Ready / Blocked;
- unmet prerequisites;
- intended origin/runtime profile.

### `playwright-execution.md`

Record:

- exact commands;
- browser/project;
- runtime/provider;
- origin;
- per-run observed final URLs/results;
- trace/report/screenshot/log references.

### `evidence-report.md`

Record:

- per-scenario result/evidence;
- summary counts;
- decisive runtime/browser evidence;
- overall result only when a governing parent/template defines the vocabulary or the workflow states completion/incompletion descriptively without inventing a new enum.

For auth verification without another parent-defined run artifact, structure this file using `AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`.

### `gap-report.md`

Record:

- Deferred;
- Blocked;
- material Skipped scenarios;
- reason;
- sign-off impact;
- unblock/verification requirement;
- next action;
- explicit no-gap statement when appropriate.

## Specialist Artifact Ownership

When artifact-backed, `playwright-e2e` also maintains exactly one persistent:

```text
07 - Playwright E2E - Summary.md
```

according to its specialist contract.

The six Workflow 06 artifacts do not replace that persistent specialist summary.

When a parent workflow defines another required run/evidence artifact:

- update that parent-defined artifact as required;
- do not invent a second parallel parent run artifact;
- keep the Workflow 06 artifacts and specialist summary aligned by reference rather than duplicating large evidence.

## Leantime

This workflow participates in the mandatory Leantime lifecycle.

- when `workflow-orchestrator` or another parent workflow owns the task, do not duplicate logical open/close calls;
- when Workflow 06 runs standalone on a fresh non-trivial task, use `leantime-integration` for one logical open;
- on resumed/re-entered work, reuse the same tracked task;
- a Fail/Blocked run requiring in-scope remediation or unblock does not automatically close the tracked task;
- reruns after remediation/precondition recovery reuse the same logical task;
- close only when the browser-validation task's actual closure conditions are satisfied;
- do not duplicate time logging;
- do not preload the full Leantime guide.

## Response

For substantial output use exactly:

1. Objective
2. Scenarios Under Test
3. Preconditions
4. Commands Run
5. Observed Results
6. Scenario Status Mapping
7. Evidence Collected
8. Gaps / Deferred Checks
9. Recommended Next Action

When reporting scenario scope, distinguish Test / Defer / Skip.

When reporting execution results, distinguish Pass / Fail / Blocked and preserve parent/auth-matrix status vocabulary when it is authoritative.

Every verification claim must be traceable to a scenario and concrete browser/runtime evidence.

## Source and Compatibility

`docs/ai/general/Workflow 06 - Playwright E2E Validation Workflow.md` remains the neutral workflow authority.

`.zenflow/workflows/playwright-e2e-validation.md` remains the current six-step execution/artifact contract reference.

`playwright-e2e` remains the repository specialist authority for Playwright runtime, runner, fixture, auth state, E2E helper/spec maintenance, and browser evidence.

For Claude Code, this skill changes context-loading and delegation mechanics only. It preserves smallest-scope verification, scenario Test/Defer/Skip planning, precondition gating, repository-valid Playwright execution, explicit scenario evidence/status mapping, mandatory gap reporting, auth template usage, six workflow artifacts, and specialist summary ownership.

If shared Workflow 06 semantics change, propagate them according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary browser validation.
