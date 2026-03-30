## What it does

Prompt source used by Zencoder: [docs/ai/general/09 - Task Brief Authoring.md](../general/09%20-%20Task%20Brief%20Authoring.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Explains how to describe a task so the ZenFlow workflow system can execute it cleanly
- Separates reusable workflow infrastructure from task-specific requirements
- Shows how the task brief should feed the relevant workflow under `.zenflow/workflows/`

## Core Rule

Keep the setup generic.

- agent prompt sources stay reusable
- workflow files stay reusable
- task-specific detail lives in your task brief, requirement docs, matrices, and attachments

Do not create a one-off prompt just because one task has a rich specification.

## Recommended Authoring Model

For each non-trivial task, provide three layers:

1. Description
2. Requirements package
3. Source files or reference docs

The description is the short operator instruction.

The requirements package is the detailed task-specific source of truth.

The source files or reference docs point the workflow and specialists to the concrete repository material that matters.

## Minimum Good Task Package

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

The filename is Copilot-branded, but the template content is reusable for Zencoder as well.

## How To Start The Task

Recommended flow:

1. Create or update the task brief in the appropriate repository location.
2. Reference any supporting matrices, checklists, specs, logs, or design docs.
3. Choose the relevant workflow under `.zenflow/workflows/`.
4. Let the workflow create the initial task artifacts at the configured artifacts path.
5. Route to the correct specialist prompt sources from `docs/ai/general/01-09`.
6. If the task needs an execution-ready delivery plan, require that planning artifact before implementation begins.

## Example use cases

- "Help me write a task brief for this feature so the workflow can execute it cleanly."
- "Normalize these scattered requirements into a structured brief with scope, criteria, and scenarios."
- "I have a feature request in rough notes — shape it into a proper requirements package."
- "Create the task brief that feeds the incident-investigation workflow for this regression."
- "Review my draft brief and call out missing acceptance criteria, unclear scope, or open questions."

## Recommended ZenFlow Workflow Entry Points

Common starting points:

- feature delivery: [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- safe refactor: [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- incident debugging: [incident-investigation.md](../../../.zenflow/workflows/incident-investigation.md)
- security-sensitive remediation: [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)

## Professional Standard

If you want behavior similar to a disciplined SDD workflow, the brief must be detailed enough that the workflow is translating and sequencing, not guessing.

The reusable system should provide:

- universal prompt sources under `docs/ai/general/`
- stable workflow files under `.zenflow/workflows/`
- stable artifact names
- stable specialist responsibilities

The task brief should provide:

- domain detail
- scenario detail
- acceptance detail
- evidence expectations

That separation is what keeps the setup clean instead of turning extension-level configuration into a folder of one-off commands.
