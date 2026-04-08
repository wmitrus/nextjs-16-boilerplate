---
description: 'Start a universal multi-step workflow task from the provided description, requirements, attached files, and repository context.'
name: 'Workflow Task'
argument-hint: 'Task description, requirements summary, referenced files, risks, scenarios, or environment notes'
agent: '08 - Workflow Orchestrator'
---

> **Leantime Integration Required**
> At task open and close, invoke the `10 - Leantime Integration Agent`.
> Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

Start a non-trivial workflow task using `08 - Workflow Orchestrator`.

Task input package:

- treat the user request as the task description
- treat attached files and referenced repository documents as the authoritative requirement sources
- do not invent requirements that are not supported by the provided materials or repository evidence

Required workflow:

- create `.copilot/tasks/{task_id}/plan.md` first
- create `intake.md` immediately after `plan.md`
- in `intake.md`, normalize the objective, requirements, scope, non-goals, acceptance criteria, scenario sources, referenced files, environment assumptions, and open questions
- make `plan.md` actionable; when the task is substantial, include checklist items for progress tracking
- when readiness or prerequisites matter, add a readiness checklist to `intake.md`
- choose only the specialist steps that are actually needed
- consolidate the specialist outputs into `constraints.md` before implementation
- if the task requires detailed scenario-by-scenario or step-by-step execution planning, create `implementation-plan.md` before implementation begins
- when `implementation-plan.md` is created for a substantial task, include checkbox/checklist sections so execution can be tracked phase by phase
- require every non-orchestrator specialist to create or update one persistent task summary file named with its agent number and name plus ` - Summary.md`
- require specialist summary files to follow the corresponding template in `docs/ai/templates/specialist-summaries/`
- after each meaningful step, phase, or specialist handoff, update the relevant checklist state in `plan.md`, `intake.md`, and `implementation-plan.md` before moving forward
- do not treat a major workflow step as complete while those task artifacts still show stale status
- use `07 - Playwright E2E` when real-browser evidence is required
- leave the artifact trail in the same task directory

For auth/bootstrap/onboarding tasks:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory scenario checklist when relevant

Required output:

1. Objective
2. Input Sources
3. Task Classification
4. Planned Specialist Sequence
5. Artifacts To Be Produced
6. Preconditions Required From User
7. Recommended Next Action
