# What it does

- Explains how to describe a task so the generic Copilot workflow can execute it cleanly
- Separates reusable workflow infrastructure from task-specific requirements
- Shows how `08 - Workflow Orchestrator` should turn your requirements into task artifacts and a detailed implementation plan

# Core Rule

Keep the setup generic.

- agents stay reusable
- prompts stay reusable
- task-specific detail lives in your task brief, requirement docs, matrices, and attachments

Do not create a one-off prompt just because one task has a rich specification.

# Recommended Authoring Model

For each non-trivial task, provide three layers:

1. Description
2. Requirements package
3. Source files or reference docs

The description is the short operator instruction.

The requirements package is the detailed task-specific source of truth.

The source files or reference docs point the agents to the concrete repository material that matters.

# Minimum Good Task Package

A good task package should contain:

- objective
- problem statement
- scope
- out-of-scope list
- concrete requirements
- scenarios or use cases
- acceptance criteria
- verification sources
- affected areas
- constraints
- environment or preconditions
- evidence expectations
- open questions

Use [COPILOT_TASK_BRIEF_TEMPLATE.md](../templates/COPILOT_TASK_BRIEF_TEMPLATE.md) as the base format.

# How To Start The Task

Recommended flow:

1. Create or update the task brief in the appropriate repository location.
2. Reference any supporting matrices, checklists, specs, logs, or design docs.
3. Start [workflow-task.prompt.md](../../../.github/prompts/workflow-task.prompt.md) with the task description and the relevant file references.
4. Let `08 - Workflow Orchestrator` create `.copilot/tasks/{task_id}/plan.md` first.
5. Let the orchestrator create `intake.md` from your brief and references.
6. Let the orchestrator decide which specialist agents are required.
7. If the task needs an execution-ready delivery plan, require `implementation-plan.md` before implementation.

# What The Orchestrator Should Produce

For a well-described task, the orchestrator should normally produce:

- `plan.md`
- `intake.md`
- specialist review artifacts when needed
- `constraints.md`
- `implementation-plan.md` when the task is scenario-heavy, multi-step, or implementation-complex
- implementation and validation artifacts

`implementation-plan.md` should be the detailed bridge between requirements and code work.

It should include, when relevant:

- scenario coverage mapping
- affected modules and files
- implementation sequencing
- trust-boundary and runtime constraints already established
- validation mapping for each scenario or change group
- blocked or deferred work

# Example Operator Pattern

Use the prompt generically.

Example shape:

```text
/Workflow Task

Description:
Implement the task described in docs/feature-desings/02 - Auth Regression Tests.md.

Requirements sources:
- docs/feature-desings/02 - Auth Regression Tests.md
- docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md
- docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md

Expectations:
- create the task workspace
- normalize the brief into intake.md
- produce a detailed implementation-plan.md for all affected scenarios
- route to the correct specialists
- use Playwright only where browser evidence is required
```

# Professional Standard

If you want behavior similar to an SDD workflow, the brief must be detailed enough that the orchestrator is translating and sequencing, not guessing.

The reusable system should provide:

- universal prompts
- stable artifact names
- stable specialist responsibilities

The task brief should provide:

- domain detail
- scenario detail
- acceptance detail
- evidence expectations

That separation is what keeps the setup clean instead of turning `.github/prompts/` into a folder of one-off commands.
