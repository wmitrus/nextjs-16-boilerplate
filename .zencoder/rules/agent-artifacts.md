---
description: How to create and maintain task artifacts during Zencoder ZenFlow workflow sessions. Use during non-trivial work to create a per-task artifact folder with a plan and specialist outputs.
alwaysApply: true
---

For non-trivial work, create a task workspace under:

- `.zenflow/tasks/{task_id}/`

Task workspace rules:

- create one directory per task
- create `plan.md` first before specialist analysis or implementation begins
- create `intake.md` immediately after `plan.md` to normalize the source requirements and references for the task
- each specialist agent must save its output as a separate artifact in the same task directory
- each non-orchestrator specialist agent must maintain exactly one persistent summary artifact for the task and update that same file on later runs instead of creating duplicates
- the specialist summary artifact filename must start with the agent number and agent name
- the specialist summary artifact should capture scope handled, actions performed, findings, decisions, blockers, and handoff-relevant summary notes
- use the corresponding template from `docs/ai/templates/specialist-summaries/` when creating or refreshing a specialist summary artifact
- later steps must read earlier relevant artifacts instead of silently re-deriving them
- `plan.md`, `intake.md`, and `implementation-plan.md` are live control documents, not static notes
- when these files contain checklists or status markers, every agent touching the task must update them as work progresses
- after finishing a meaningful step, phase, or specialist handoff, update the relevant checklist items in the task artifacts before moving to the next step
- do not treat progression to the next major step as complete until the corresponding artifact state is synchronized
- if a step is blocked, partially complete, skipped, or deferred, record that status explicitly in the relevant artifact instead of leaving stale unchecked or checked items
- keep source requirement documents in their original repository location; task artifacts should summarize and reference them rather than copy them wholesale
- when a task is substantial or phase-based, prefer actionable checklist sections in `plan.md` and `implementation-plan.md` so progress can be tracked directly in the artifact
- when a task is substantial or phase-based, `intake.md` should also include a readiness checklist that is kept in sync with `plan.md` and `implementation-plan.md`

Minimum expected files when relevant:

- `plan.md`
- `intake.md`
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `06 - Debug Investigation - Summary.md`
- `07 - Playwright E2E - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `constraints.md`
- `implementation-plan.md`
- `validation-report.md`

For auth/bootstrap/onboarding work that uses Playwright, prefer structuring the E2E artifact with:

- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

If a step is skipped, record that explicitly in `plan.md` or the relevant artifact rather than omitting it silently.

Preferred specialist summary artifact mapping:

- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `06 - Debug Investigation - Summary.md`
- `07 - Playwright E2E - Summary.md`
- `04 - Implementation Agent - Summary.md`

The Workflow Orchestrator is excluded from this per-agent summary-file requirement because it owns the primary control artifacts such as `plan.md`, `intake.md`, `constraints.md`, and `implementation-plan.md`.

Use `docs/ai/general/ARTIFACTS_GUIDE.md` to understand the artifact authority model rather than inventing per-task conventions ad hoc.
