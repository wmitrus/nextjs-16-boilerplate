---
description: 'Start a universal multi-step workflow task from the provided description, requirements, attached files, and repository context.'
name: 'Workflow Task'
argument-hint: 'Task description, requirements summary, referenced files, risks, scenarios, or environment notes'
agent: '08 - Workflow Orchestrator'
---

Start a non-trivial workflow task using `08 - Workflow Orchestrator`.

Task input package:

- treat the user request as the task description
- treat attached files and referenced repository documents as the authoritative requirement sources
- do not invent requirements that are not supported by the provided materials or repository evidence

Required workflow:

- create `.copilot/tasks/{task_id}/plan.md` first
- create `intake.md` immediately after `plan.md`
- in `intake.md`, normalize the objective, requirements, scope, non-goals, acceptance criteria, scenario sources, referenced files, environment assumptions, and open questions
- choose only the specialist steps that are actually needed
- consolidate the specialist outputs into `constraints.md` before implementation
- if the task requires detailed scenario-by-scenario or step-by-step execution planning, create `implementation-plan.md` before implementation begins
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
