---
name: safe-feature-workflow
description: Feature-delivery workflow for this repository. Use whenever the task is a new feature or non-trivial behavior change that should preserve architecture, security, runtime correctness, and low blast radius, even if the user does not explicitly ask for a "workflow."
---

# Safe Feature Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`
- `.zenflow/workflows/feature-development.md`

Use this skill when the task is feature delivery or a non-trivial behavior change that
needs the repository's normal constraint-first sequence.

## Startup

Before substantial work:

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`.

For security-sensitive feature work:

- read `docs/ai/general/SECURITY_CODING_PATTERNS.md`

For auth/bootstrap/onboarding feature work:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

For artifact-backed work under `.copilot/tasks/{task_id}/`:

- create or update `plan.md` first
- create or update `intake.md` immediately after `plan.md`
- keep checklist state synchronized as the work progresses
- create or update the relevant specialist summary artifacts when those passes are run
- create or update `validation-report.md` after validation

## Mission

Safely introduce a new feature or non-trivial change while preserving architecture,
security, runtime correctness, and low blast radius.

## Fast Path

You may use the reduced path only when the change clearly:

- affects only a small number of files
- does not touch architecture boundaries
- does not touch auth or security flows
- does not affect runtime placement or caching
- does not modify contracts or DI/composition
- does not change public behavior significantly

If any of these are uncertain, do not use the fast path.

## Working Sequence

1. Intake and scope
2. Architecture Guard review for non-trivial work
3. Conditional Security/Auth review
4. Conditional Next.js Runtime review
5. Constraint summary
6. Implementation
7. Validation

Use `09 - Task Brief Authoring` before this workflow when the requirements package is
still messy or underspecified.

## Required Output Shape

For substantial kickoff or review output, use:

1. Objective
2. Input Sources
3. Feature Classification
4. Planned Specialist Sequence
5. Artifacts To Be Produced
6. Current Status
7. Recommended Next Action

## Compatibility Notes

- `docs/ai/general/Workflow 01 - Safe Feature Workflow.md` remains the shared, neutral
  workflow source
- `.zenflow/workflows/feature-development.md` remains the ZenFlow execution layer
- this skill is the Codex-native runtime surface for the same workflow intent
