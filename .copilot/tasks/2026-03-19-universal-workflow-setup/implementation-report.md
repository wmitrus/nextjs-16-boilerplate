# Implementation Report

## Summary

Refactored the Copilot workflow system to keep prompts and agent entrypoints reusable while moving task-specific detail into task briefs, requirement docs, and attachments.

## Key Changes

- replaced the one-off auth regression workflow prompt with a universal orchestrator prompt
- replaced the auth-specific E2E entry prompt with a universal Playwright E2E validation prompt
- updated the Workflow Orchestrator to normalize source inputs into `intake.md` and create `implementation-plan.md` when a task needs execution-ready planning
- updated the Playwright E2E specialist to work from task artifacts and task-provided checklists or matrices
- extended the artifact model with `implementation-plan.md`
- documented how to author a task brief and how to drive the system with generic prompts

## Files Changed

- `.github/agents/workflow-orchestrator.agent.md`
- `.github/agents/playwright-e2e.agent.md`
- `.github/instructions/agent-artifacts.instructions.md`
- `.github/prompts/playwright-e2e-validation.prompt.md`
- `.github/prompts/workflow-task.prompt.md`
- `docs/ai/copilot/07 - Playwright E2E Agent.md`
- `docs/ai/copilot/08 - Workflow Orchestrator Agent.md`
- `docs/ai/copilot/09 - Task Brief Authoring.md`
- `docs/ai/copilot/README.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/templates/COPILOT_TASK_BRIEF_TEMPLATE.md`

## Files Removed

- `.github/prompts/auth-flow-playwright-e2e.prompt.md`
- `.github/prompts/auth-regression-workflow.prompt.md`

## Resulting Operating Model

- reusable agents stay in `.github/agents/`
- reusable prompts stay in `.github/prompts/`
- task-specific source requirements stay in their domain-appropriate repository location
- `.copilot/tasks/{task_id}/` stores derived workflow artifacts and handoff evidence

## Residual Notes

- `Auth Flow Change Review` remains task-domain-specific by design because auth-flow review is a recurring repository concern rather than a one-off feature prompt
- historical task artifacts may still mention removed prompt names; they are retained as historical records
