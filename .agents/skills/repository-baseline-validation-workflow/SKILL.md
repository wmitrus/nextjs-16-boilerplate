---
name: repository-baseline-validation-workflow
description: Read-only repository-wide validation-posture audit for CI quality gates, test-layer health, over-mocking, critical scenario coverage, and architecture-boundary validation gaps. Use for full-repository or explicitly targeted-module baseline audits, not for validating one specific diff. Always use `validation-strategy` and `architecture-guard`, preserve the six Workflow 08 artifacts, prioritize CRITICAL/MAJOR/MINOR gaps, and recommend concrete improvements without implementing them.
---

# Repository Baseline Validation Workflow

Audit the repository's current validation posture and governance quality.

This workflow is read-and-recommend only. It identifies real validation gaps, correlates them with architecture/boundary risk, prioritizes them, and recommends the smallest useful governance improvements.

It does not implement tests, change CI, modify lint rules, refactor production code, or try to make the repository green during the audit.

## Ownership

This workflow owns:

- baseline scope/intake;
- validation-infrastructure inventory;
- coordination of the two mandatory specialists;
- cross-correlation of validation and architecture findings;
- CRITICAL / MAJOR / MINOR prioritization;
- recommendations;
- six Workflow 08 phase artifacts and consolidated report.

`validation-strategy` owns:

- repository validation-posture analysis;
- test-level fit;
- over-mocking/false-confidence analysis;
- CI/gate sufficiency;
- critical scenario coverage assessment.

`architecture-guard` owns:

- architecture boundary/DI/composition analysis;
- identification of structurally important surfaces lacking meaningful validation;
- correlation between boundary/enforcement risk and test coverage.

Neither specialist implements fixes during this workflow.

## Context Loading

Inherit active repository invariants from `AGENTS.md`.

Do not preload full copies of:

- `MODE_MANIFEST.md`;
- Agent Interaction Protocol;
- Repository AI Context;
- neutral Workflow 08;
- full Validation Strategy source;
- full Architecture Guard source;
- full Playwright/E2E documentation;
- full Security Coding Patterns catalogue.

At start:

1. establish audit scope;
2. inspect live `package.json` validation/build/quality scripts;
3. discover the validation configuration files those scripts actually use;
4. inspect relevant CI workflows and quality-gate configuration;
5. inspect only the representative test/code/boundary surfaces required to assess real coverage quality;
6. invoke `validation-strategy`;
7. invoke `architecture-guard`;
8. expand into targeted docs/security/runtime sources only when a concrete gap cannot be classified safely from live repository evidence.

Repository code/config/workflows are the source of truth for the current validation posture.

Docs are supporting context. If docs disagree with current scripts/config/workflows, record the drift.

## Entry Conditions

Use for:

- full repository validation-posture audits;
- periodic test-stack health reviews;
- CI/CD quality-gate reviews;
- pre-refactor or pre-release governance reviews;
- identifying validation blind spots before security-sensitive work;
- targeted-module baseline audits when the user explicitly scopes the audit to one or more modules.

Do not use for:

- validation of one specific change — use `change-validation-workflow`;
- debugging a failing test — use `debug-investigation`;
- browser verification of task scenarios — use `playwright-e2e-validation-workflow`;
- implementing validation improvements;
- a narrow question about one test/config where a full baseline audit adds no value.

For a **full repository audit**, both specialists are mandatory.

For a **targeted-module audit**, both specialists are still mandatory but must remain scoped to the target plus the minimum shared validation/architecture infrastructure needed to interpret it.

## Audit Scope

At intake classify scope as exactly one:

- **Full Repository**
- **Targeted Modules**

For Targeted Modules, record:

- exact modules/areas;
- shared infrastructure included only because it governs those areas;
- explicit exclusions.

Do not silently turn a targeted audit into a full repository audit.

If the requested scope is too ambiguous to identify the validation and architecture surfaces meaningfully, stop before specialist review and report the scope gap.

## Core Principles

Always:

- inventory what the repository actually validates today;
- judge test quality by risk reduction, not test count;
- distinguish presence of a test from meaningful exercise of the real risk surface;
- include CI/CD quality gates in the posture assessment;
- identify over-mocking and false-confidence patterns;
- correlate validation gaps with architectural/security enforcement surfaces;
- distinguish evidence-backed gaps from hypotheses;
- make each recommendation concrete enough to execute later;
- prioritize by risk, not ease of implementation.

Never:

- recommend "add more tests" without naming the risk and validation layer;
- treat coverage percentage alone as proof of quality;
- assume an unexecuted CI command is enforced merely because a package script exists;
- assume a workflow gate is effective without reading its trigger/conditions;
- run broad test suites by default merely to perform a posture audit;
- implement audit recommendations;
- edit CI/config/tests during the audit;
- inflate MINOR gaps into CRITICAL findings for attention.

## Validation Infrastructure Inventory

Discover the current stack from live `package.json` scripts, then follow the configs/runners and CI workflows they actually use.

Inventory, when present/relevant:

- static/build/architecture gates: typecheck, lint, architecture checks, build, env/deploy validators;
- unit, integration, DB-backed, and test-infrastructure layers;
- Storybook/component validation;
- Playwright/E2E scenario runners, auth/matrix/smoke suites, and runtime/deploy smoke checks;
- coverage provider, thresholds, exclusions, reporting, and enforcement;
- CI/CD jobs, triggers, path/event conditions, blocking behavior, security/static-analysis gates, and deployment validation.

Do not use a stale hard-coded config list or infer CI enforcement from local scripts alone.

## Evidence Sampling

This is a posture audit, not a mandatory full-suite execution workflow.

Prefer evidence from:

1. live scripts, configs, and CI workflows;
2. representative tests and production enforcement seams;
3. current CI/test artifacts already available;
4. focused read-only commands only when they resolve a concrete audit uncertainty.

Do not run broad suites such as `pnpm test:all` or the full E2E matrix merely to prove the audit was executed.

If the user's goal is instead to prove the repository currently passes its full validation baseline, treat that as a separate explicitly scoped execution task.

## Workflow Sequence

### 1. Baseline Intake

Collect:

- audit scope;
- known concerns/prior issues;
- priority risk areas;
- current repository revision/working context when relevant;
- live validation scripts;
- test/config/runner inventory;
- coverage configuration;
- relevant CI/CD workflows/gates.

For the inventory:

1. read `package.json`;
2. follow referenced validation configs/runners;
3. inspect relevant `.github/workflows/`;
4. identify additional established validation mechanisms from live repository ownership;
5. note missing/inaccessible infrastructure explicitly.

Examples named by neutral Workflow 08 such as:

```text
vitest.unit.config.ts
vitest.integration.config.ts
vitest.config.ts
playwright.config.ts
```

are expected surfaces when present, not a closed list.

Required output:

- audit scope;
- validation infrastructure inventory;
- CI quality-gate inventory;
- coverage posture inputs;
- known concerns;
- evidence/access gaps.

If key validation infrastructure is inaccessible, stop before recommendations and report Blocked.

If the repository genuinely has no test infrastructure at all, do **not** block: continue and classify that as a CRITICAL gap.

### 2. Validation Posture Audit — Mandatory

Invoke `validation-strategy` in repository-baseline mode.

Provide a concise evidence package:

- audit scope;
- live script/config inventory;
- relevant CI workflow inventory;
- representative test structure;
- coverage configuration;
- known concerns;
- targeted-module boundary when applicable.

Require assessment of:

#### Unit layer

- presence and scope;
- co-location/ownership;
- behavior vs implementation-detail testing;
- important untested units;
- mocking quality.

#### Integration layer

- real cross-layer behavior tested;
- DB/infrastructure realism;
- over-mocking;
- important service/repository/module seams;
- missing integration proof.

#### DB-backed validation

When the repository has a distinct DB test layer, assess it separately rather than hiding it inside generic integration coverage.

#### UI / component layer

When Storybook/component tests exist, assess:

- what risk they cover;
- what they do not cover;
- whether they duplicate or complement unit/E2E validation.

#### E2E layer

Assess:

- Playwright architecture/config;
- scenario runner ownership;
- representative browser coverage;
- auth/bootstrap/onboarding coverage;
- critical public/demo/runtime flows;
- whether expensive browser tests are used where narrower checks would be stronger.

Do not duplicate the full `playwright-e2e` specialist review unless a concrete E2E posture uncertainty requires targeted consultation. Validation Strategy remains the baseline-audit owner.

#### CI / quality gates

Assess actual workflow enforcement:

- which validation layers run;
- on what events/paths;
- blocking vs non-blocking behavior;
- missing gates;
- duplicated low-signal gates;
- conditional gaps.

#### Critical scenarios

Assess meaningful coverage for applicable:

- authentication;
- authorization;
- tenancy/resource scope;
- security-sensitive flows;
- runtime/cache/env-sensitive behavior;
- deploy/build/runtime contracts.

#### Over-mocking / false confidence

Identify where tests bypass the actual risk surface.

Required output:

- tier-by-tier posture;
- confirmed gaps/blind spots;
- over-mocking findings;
- critical-scenario assessment;
- CI/gate assessment;
- evidence and uncertainty.

`validation-strategy` maintains its one persistent specialist summary when artifact-backed.

### 3. Architecture Boundary Audit — Mandatory

Invoke `architecture-guard` in read-only audit mode.

For Full Repository, inspect repository-wide structurally significant seams.

For Targeted Modules, restrict the audit to:

- the target modules;
- their allowed dependency boundaries;
- required composition/DI/public contract seams;
- shared enforcement surfaces needed to assess their validation risk.

Focus on:

- module boundaries with no meaningful integration validation;
- DI/composition points with no meaningful test proof;
- public contracts with only implementation-detail tests;
- auth/authorization/tenant enforcement points with no dedicated validation;
- security-critical paths not covered by any relevant test layer;
- cross-module behavior whose only evidence is mocks;
- architecture lint/check coverage vs actual boundary risk.

Architecture Guard must not redesign the repository or implement tests.

Required output:

- architecture surfaces with validation gaps;
- highest-risk boundary/enforcement gaps;
- correlation between structural risk and existing validation;
- evidence-backed architecture recommendations/constraints for later work.

`architecture-guard` maintains its one persistent specialist summary when artifact-backed.

### 4. Risk and Gap Assessment

Combine Step 2 and Step 3.

Deduplicate findings that describe the same underlying risk.

Classify every retained gap exactly one:

- **CRITICAL**
- **MAJOR**
- **MINOR**

Use Workflow 08 meanings:

### CRITICAL

Validation gaps in areas such as:

- authentication;
- authorization;
- trust boundaries;
- tenancy/resource enforcement;
- security enforcement;

where missing/weak validation leaves a material production safety risk.

Do not classify a security-related file as CRITICAL merely because it is security-related; the gap itself must justify the severity.

### MAJOR

Examples:

- meaningful module-boundary gaps;
- DI/composition seams lacking validation;
- important public/cross-layer contracts weakly tested;
- CI quality-gate omissions;
- material runtime/deploy validation gaps not rising to CRITICAL.

### MINOR

Examples:

- lower-risk coverage blind spots;
- validation organization/style inconsistencies;
- non-critical scenario gaps;
- redundant/low-value validation cost.

For each gap record:

- ID;
- severity;
- risk surface;
- evidence;
- current validation;
- missing assurance;
- why the assigned severity is justified;
- source specialist(s).

Do not duplicate the same gap under multiple severities.

### 5. Recommendations

For every retained gap provide an actionable recommendation.

Each recommendation must include:

- gap ID;
- recommended validation layer/mechanism;
- concrete scope;
- concrete risk it mitigates;
- expected confidence gain;
- estimated blast radius;
- priority;
- whether it is:
  - new validation;
  - strengthened existing validation;
  - CI/gate change;
  - mocking reduction;
  - architecture enforcement/validation;
  - documentation/governance only.

For CRITICAL gaps, name the specific test/check/enforcement addition needed.

For MAJOR gaps, identify the correct validation layer and bounded scope.

For MINOR gaps, keep the recommendation proportionate.

Do not implement any recommendation during this workflow.

Do not recommend E2E by default when a focused integration/contract/route test gives stronger cheaper evidence.

### 6. Output Report

Consolidate the audit without copying every specialist artifact verbatim.

Include:

- scope;
- validation-infrastructure summary;
- tier-by-tier posture;
- architecture-boundary gap summary;
- deduplicated prioritized gap list;
- recommendations;
- highest-priority next action;
- audit limitations/evidence gaps.

The final report should reference specialist artifacts for detailed evidence rather than duplicate them wholesale.

## Artifact Contract

When Workflow 08 is run for `.copilot/tasks/{task_id}/`, preserve these six workflow-step artifacts:

```text
baseline-intake.md
validation-posture.md
architecture-audit.md
risk-assessment.md
recommendations.md
baseline-report.md
```

Every executed workflow step creates/updates its defined artifact.

### `baseline-intake.md`

Record:

- Full Repository / Targeted Modules;
- exact target/exclusions when targeted;
- validation/test/config/runner inventory;
- CI quality-gate inventory;
- coverage inputs;
- known concerns;
- evidence/access gaps.

### `validation-posture.md`

Record the Workflow 08 Validation Strategy result:

- tier-by-tier posture;
- gaps/blind spots;
- over-mocking;
- critical-scenario coverage;
- CI/gate assessment.

This workflow artifact does not replace:

```text
05 - Validation Strategy - Summary.md
```

which remains owned by `validation-strategy`.

### `architecture-audit.md`

Record the Workflow 08 Architecture Guard result:

- structural validation gaps;
- boundary/enforcement risks;
- correlation with test coverage;
- audit scope and evidence.

This workflow artifact does not replace the Architecture Guard persistent specialist summary.

### `risk-assessment.md`

Record:

- deduplicated CRITICAL / MAJOR / MINOR gaps;
- evidence;
- risk justification;
- source specialist(s).

### `recommendations.md`

Record:

- actionable recommendation per gap;
- validation layer/mechanism;
- scope;
- blast radius;
- priority;
- highest-priority next action.

### `baseline-report.md`

Consolidate:

- validation posture summary;
- architecture gap summary;
- prioritized gap list;
- recommendations;
- limitations;
- recommended next action.

When `workflow-orchestrator` owns the task:

- it owns top-level `plan.md`, `intake.md`, and lifecycle;
- do not duplicate them;
- synchronize parent state only when the audit changes task status/scope/next action.

Do not create duplicate specialist summaries or parallel baseline reports.

## Block Conditions

Stop and report a block when:

- audit scope is too ambiguous for meaningful assessment;
- required repository validation infrastructure cannot be accessed sufficiently to establish current posture;
- the targeted-module boundary cannot be identified safely.

Do not block merely because:

- tests are sparse;
- coverage is weak;
- CI lacks gates;
- the repository has no test infrastructure.

Those are audit findings, potentially CRITICAL.

If one specialist is unavailable in the active runtime, the full Workflow 08 contract cannot be completed. Record the limitation; do not fabricate that specialist's findings.

## No-Implementation Boundary

This is a strict read-and-recommend workflow.

Do not:

- add tests;
- edit test fixtures;
- modify CI workflows;
- change coverage thresholds;
- add/modify architecture lint rules;
- refactor mocking;
- change production code;
- suppress findings;
- commit/push/deploy.

If the user wants to act on recommendations, hand off the selected gap to the appropriate implementation-planning workflow:

- validation improvement such as adding/strengthening tests or changing CI/gates → `task-brief-authoring` when requirements need normalization, then `workflow-orchestrator` / `implementation-agent` under the required specialist constraints;
- `change-validation-workflow` is for determining/executing validation of the resulting specific change, not for implementing the audit recommendation itself;
- architecture enforcement change → architecture-aware safe-refactor/feature workflow as appropriate;
- security gap requiring remediation → `security-incident-workflow` only when an actual security incident exists, otherwise normal security-aware feature/fix workflow.

Do not automatically convert an audit finding into an implementation task.

## Task Lifecycle

Follow the repository task lifecycle from the root instructions; a blocked
audit caused by missing scope/access does not by itself mark the tracked
Linear issue Done when follow-up is still in scope — only a completed report
or an explicitly final blocked result with required evidence recorded does.
Do not invoke Leantime for active task tracking unless the user explicitly
requests Leantime or a Leantime migration operation.

## Response

For substantial output use exactly:

1. Objective
2. Audit Scope
3. Validation Infrastructure Inventory
4. Validation Posture Assessment
5. Architecture Boundary Gap Assessment
6. Prioritized Gap List
   - CRITICAL
   - MAJOR
   - MINOR
7. Recommendations per Gap
8. Recommended Next Action

Lead with CRITICAL findings when any exist.

Every gap must be traceable to live repository evidence and/or a specialist artifact.

## Source and Compatibility

`docs/ai/general/Workflow 08 - Repository Baseline Validation Workflow.md` remains the neutral workflow authority.

`.zenflow/workflows/repository-baseline-validation.md` remains the current six-step execution/artifact contract reference.

`validation-strategy` and `architecture-guard` are mandatory specialist authorities for both full-repository and targeted-module Workflow 08 runs, with scope restricted appropriately for targeted audits.

For Codex, this skill changes context-loading, inventory discovery, and evidence-reuse mechanics only. It preserves the read-and-recommend boundary, both mandatory specialists, validation-stack inventory, architecture correlation, CRITICAL/MAJOR/MINOR prioritization, actionable recommendations, and six workflow artifacts.

If shared Workflow 08 semantics change, propagate them according to repository agent-infrastructure rules. Do not load propagation documentation during ordinary baseline audits.
