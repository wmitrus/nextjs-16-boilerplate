## What it does

Real agent file: [workflow-orchestrator.agent.md](../../../.github/agents/workflow-orchestrator.agent.md)

- Defines `08 - Workflow Orchestrator` as the process owner for multi-step Copilot tasks
- Focuses on:
  - plan-first task setup
  - intake normalization from requirements and attached files
  - specialist sequencing
  - detailed implementation-plan creation when needed
  - actionable task artifacts with trackable checklists for substantial work
  - synchronizing checklist state across `plan.md`, `intake.md`, and `implementation-plan.md` before each major handoff
  - enforcing one persistent per-task summary artifact for each non-orchestrator specialist agent
  - requiring specialist summary artifacts to follow the matching template under `docs/ai/templates/specialist-summaries/`
  - per-task artifact continuity
  - keeping design, implementation, validation, and documentation in the right order
- Uses `read`, `search`, `edit`, `todo`, and `agent`
- Coordinates specialist work without replacing specialist authority

## When to use it

- When one task needs multiple specialist agents in sequence
- When you want all task artifacts under one `.copilot/tasks/{task_id}/` folder
- When work must be designed, implemented, validated, and documented as one controlled flow
- When you want to start from requirements, description, and referenced files instead of manually stitching the workflow together

## Auth-Flow Note

For any auth/bootstrap/onboarding orchestration:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` for the final Playwright run artifact

## Example prompts to try

- "Start a workflow task from these requirements and attached files."
- "Create the task workspace, normalize the brief, and build a detailed implementation plan."
- "Orchestrate this feature from design review through implementation and validation."

## Available slash prompt

Real prompt file: [workflow-task.prompt.md](../../../.github/prompts/workflow-task.prompt.md)

```bash
/Workflow Task
```
