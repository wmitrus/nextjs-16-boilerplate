# Plan

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
- `implementation-report.md`
