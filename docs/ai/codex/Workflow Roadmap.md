# Codex Workflow Roadmap

This document now records the current Codex workflow coverage for this repository, why
those workflows are usable in Codex, and what still remains as lower-priority follow-up.

## Core Reality

Codex can use repo-local workflow skills effectively, but not in the same way ZenFlow
executes workflow files.

What works well in Codex:

- a workflow expressed as a repo-local skill under `.agents/skills/<workflow>/SKILL.md`
- clear artifact rules
- clear specialist sequencing
- optional subagent delegation directed by `08 - Workflow Orchestrator`

What does not exist as a first-class runtime:

- an automatic Codex workflow engine that directly executes `.zenflow/workflows/*.md`
- automatic binding from a repo-local workflow file to a spawned subagent identity

So Codex workflows are usable when they are modeled as reusable workflow skills, not as
passive markdown specs.

## Current Workflow Coverage

Implemented Codex workflow skills:

- `Workflow 01 - Safe Feature` ->
  `.agents/skills/safe-feature-workflow/SKILL.md`
- `Workflow 02 - Safe Refactor` ->
  `.agents/skills/safe-refactor-workflow/SKILL.md`
- `Workflow 03 - Security Incident` ->
  `.agents/skills/security-incident-workflow/SKILL.md`
- `Workflow 04 - Incident Investigation` ->
  `.agents/skills/incident-investigation-workflow/SKILL.md`
- `Workflow 05 - Auth Flow Change Review` ->
  `.agents/skills/auth-flow-change-review-workflow/SKILL.md`
- `Workflow 06 - Playwright E2E Validation` ->
  `.agents/skills/playwright-e2e-validation-workflow/SKILL.md`
- `Workflow 07 - Change Validation` ->
  `.agents/skills/change-validation-workflow/SKILL.md`
- `Workflow 08 - Repository Baseline Validation` ->
  `.agents/skills/repository-baseline-validation-workflow/SKILL.md`
- `Workflow 10 - Codacy Security Review` ->
  `.agents/skills/codacy-security-review-workflow/SKILL.md`
- `Workflow 11 - Codacy Findings Review` ->
  `.agents/skills/codacy-findings-review-workflow/SKILL.md`

These are usable in Codex because each one is expressed as a repo-local skill with
clear artifact rules, sequencing guidance, and explicit handoff boundaries to the
specialist agent set.

## Should Safe Feature Be The Default?

Yes, but only for non-trivial feature work.

Use `Workflow 01 - Safe Feature` by default when the feature:

- changes behavior in a meaningful way
- touches multiple files or layers
- may affect architecture boundaries, auth, runtime placement, caching, or tests
- is large enough that you want constraints clarified before implementation

Do not force `Workflow 01 - Safe Feature` onto every small change.

For small feature work, use the repository's fast path instead when the change clearly:

- affects only a small number of files
- does not touch architecture boundaries
- does not touch auth or security flows
- does not affect runtime placement or caching
- does not modify contracts or DI/composition
- does not change public behavior significantly

In that case, a direct implementation pass, or `08 - Workflow Orchestrator` with a very
small sequence, is enough.

## Practical Entry Rules

### Small Feature

Use:

- direct implementation, or
- `08 - Workflow Orchestrator` with a fast path

Example shape:

- one screen tweak with a small server-side data update
- isolated feature flag wiring with no trust-boundary impact
- additive UI behavior in an already stable module

### Medium Feature

Use:

- `Workflow 01 - Safe Feature`

Example shape:

- a new feature touching a page, route handler, and a service
- a feature that may need architecture, runtime, or validation review
- a feature that changes user-visible behavior and needs focused tests

### Large Feature

Use:

- `09 - Task Brief Authoring` first if the brief is still messy
- then `08 - Workflow Orchestrator`
- optionally `Workflow 01 - Safe Feature` as the reusable wrapper when the task shape
  matches

Example shape:

- a multi-phase feature with several scenarios
- a feature crossing modules or involving auth, tenancy, runtime, and browser flows
- work that needs explicit artifacts, phased sequencing, and possible subagent
  delegation

## Why These Workflows Work Well In Codex

- `Workflow 01 - Safe Feature` works because it gives Codex a reusable feature-delivery
  shell with a documented fast path for small work.
- `Workflow 02 - Safe Refactor` works because its behavior-preserving sequence is stable
  and easy to audit.
- `Workflow 03 - Security Incident` works because the containment and evidence flow is
  explicit enough to encode as a skill.
- `Workflow 04 - Incident Investigation` works because it naturally escalates from
  evidence gathering into Runtime, Security, or Implementation.
- `Workflow 05 - Auth Flow Change Review` works because auth and onboarding changes need
  repeatable trust-boundary sequencing.
- `Workflow 06 - Playwright E2E Validation` works because the main task shape is
  verification rather than implementation.
- `Workflow 07 - Change Validation` works because it centers validation-scope decisions
  once implementation is already done.
- `Workflow 08 - Repository Baseline Validation` works because repository health review
  is better represented as a structured workflow than as a single specialist pass.
- `Workflow 10` and `Workflow 11` work because Codacy review handling is narrow,
  repeatable, and artifact-friendly.

## Remaining Candidate

### Workflow 09 - Architecture Lint

- Shared source: `.zenflow/workflows/architecture-lint.md`
- Why it is still a candidate:
  - it may still be worth adding as a Codex workflow if the repo wants a reusable
    periodic architecture hygiene pass
  - it is lower priority than the currently implemented workflows because it is less
    central to day-to-day delivery than feature, incident, auth, and validation flows

## Relationship To 08 And 09

- `09 - Task Brief Authoring` is the pre-workflow intake layer when the request is still
  messy.
- `08 - Workflow Orchestrator` is the generic process owner when the task already needs
  coordinated execution.
- A Codex workflow skill is a reusable task-shape wrapper that can sit on top of `08`
  and call for `09` when needed.

Good rule of thumb:

- use `09` when the task is not ready
- use `08` when the task is ready but needs coordination
- use a workflow skill when the task shape is common enough that the sequence itself
  should become reusable
