# Task Plan

## Objective

Refactor the Copilot workflow setup so prompts and task-start flow are universal rather than tied to a single auth regression use case.

## Current Problem

- The orchestrator agent is appropriately generic.
- The current workflow entry prompt is too task-specific (`Auth Regression Workflow`).
- The current Playwright prompt is also narrower than the desired long-term operating model.
- The docs do not yet describe a clean, reusable way to start a task from requirements, description, and attached repository files.

## Desired Outcome

- A universal orchestrator entrypoint for plan-first multi-agent work.
- A universal Playwright E2E entrypoint for real-browser verification tasks.
- Documentation that explains how to author a task brief in a complete, implementation-ready way.
- Clear separation between reusable infrastructure and task-specific requirement documents.

## Likely Affected Areas

- `.github/prompts/`
- `.github/agents/workflow-orchestrator.agent.md`
- `.github/agents/playwright-e2e.agent.md`
- `docs/ai/copilot/README.md`
- `docs/ai/copilot/07 - Playwright E2E Agent.md`
- `docs/ai/copilot/08 - Workflow Orchestrator Agent.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`

## Expected Specialist Sequence

1. Direct repository analysis
2. Workflow/orchestrator refactor
3. Prompt refactor
4. Task-authoring documentation
5. Focused validation of changed files

## Planned Artifacts

- `plan.md`
- `implementation-report.md`
- `validation-report.md`
