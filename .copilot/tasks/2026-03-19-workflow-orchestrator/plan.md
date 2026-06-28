# Plan

## Status

**COMPLETED — WORKFLOW ORCHESTRATOR INTRODUCED, THEN LATER GENERALIZED BY FOLLOW-UP REFACTOR**

## Task

Implement a Workflow Orchestrator Agent for Copilot and define how to start the auth regression task described in `docs/feature-desings/02 - Auth Regression Tests.md`.

## Objective

Add one orchestrating agent that can drive multi-step repository work across specialist agents while preserving per-task artifacts under `.copilot/tasks/{task_id}/`.

## Likely Affected Areas

- `.github/agents/*`
- `.github/prompts/*`
- `.github/instructions/*`
- `docs/ai/copilot/*`
- `docs/ai/general/*`

## Expected Specialist Sequence

1. Workflow Orchestrator creates task workspace and `plan.md`
2. Relevant specialist agents produce their own artifacts
3. Implementation and validation results are stored in the same task directory

## Known Risks / Unknowns

- Need to preserve the existing specialist authority model without turning the orchestrator into a generic implementation agent
- Need to document clearly that the orchestrator coordinates work but does not replace specialist authority
- Need to define a practical start path for auth regression work using real-browser Playwright verification

## Planned Artifacts

- `plan.md`
- `04 - Implementation Agent - Summary.md`

## Closeout Outcome

- The task objective was completed: a Workflow Orchestrator Agent was added and wired into the Copilot operating model.
- The implementation result is captured in `implementation-report.md`.
- One originally introduced prompt (`auth-regression-workflow.prompt.md`) was later superseded by the broader universal workflow setup, which is expected evolution rather than evidence that this task remained unfinished.
