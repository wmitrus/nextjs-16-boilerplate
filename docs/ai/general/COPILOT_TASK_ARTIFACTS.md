# Copilot Task Artifacts

## Purpose

This document defines where Copilot task artifacts should live, how they should be structured, and how to use them during multi-agent work.

Use this document for Copilot-driven task execution.

This is the Copilot counterpart to the broader artifact guidance in `ARTIFACTS_GUIDE.md`.

---

## Task Workspace Location

For non-trivial Copilot work, create a task workspace under:

`.copilot/tasks/{task_id}/`

Recommended `task_id` shape:

- short date prefix
- short slug

Examples:

- `.copilot/tasks/2026-03-19-auth-flow-e2e/`
- `.copilot/tasks/2026-03-19-users-guard-fix/`

Use one directory per task.
Do not mix unrelated tasks into the same directory.

---

## Minimum Lifecycle

Every non-trivial task should follow this minimum lifecycle:

1. create the task directory
2. create `plan.md`
3. create `intake.md`
4. add specialist artifacts as the task progresses
5. preserve the implementation and validation evidence in the same directory

The task artifacts above are live workflow controls. They must be updated as work progresses rather than left as initial planning snapshots.

The first artifact must be:

- `plan.md`

It should describe:

- task objective
- likely affected areas
- expected specialist sequence
- known risks or unknowns
- artifact list for the task

When the task is substantial, multi-step, or likely to be executed over time, `plan.md` should also include actionable checklist items so the artifact works as a live execution tracker rather than only a static summary.

The second artifact should normally be:

- `intake.md`

It should normalize the user-provided task package:

- objective
- requirements
- scope and non-goals
- acceptance criteria
- scenario or checklist sources
- referenced repository files or docs
- environment assumptions
- open questions or blockers

When task execution depends on prerequisites, readiness, or phased entry conditions, `intake.md` should also include a readiness checklist. After a larger milestone is finished, agents should update `intake.md` together with `plan.md` so the task state stays aligned.

---

## Recommended File Set

Create only the files that are relevant, but prefer stable names.

Common files:

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

Specialist artifact rule:

- each non-orchestrator specialist keeps one persistent per-task summary file
- the filename must use the pattern `NN - Agent Name - Summary.md`
- later runs by the same specialist update the existing file instead of creating another one
- the file should summarize scope handled, actions performed, findings, decisions, blockers, and handoff notes
- use the corresponding template from `docs/ai/templates/specialist-summaries/`

For substantial phase-based work, prefer making `implementation-plan.md` executable as a checklist:

- top-level progress checklist
- phase-level checklists
- scenario-level checkboxes when the task is scenario-driven

Checklist synchronization rule:

- after completing a meaningful step, phase, or specialist handoff, update the relevant checkbox state before moving on
- keep `plan.md`, `intake.md`, and `implementation-plan.md` consistent with one another when they describe the same milestone
- if something is blocked, deferred, skipped, or only partially complete, record that state explicitly instead of leaving stale checklist state behind
- do not treat a major workflow step as complete while the control artifacts still show outdated status

For auth-flow real-browser verification, prefer also using:

- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

as the content template for:

- `07 - Playwright E2E - Summary.md`

---

## Recommended Ownership

- first orchestrating step: creates `plan.md`
- orchestrating intake step: creates `intake.md`
- Architecture Guard: `01 - Architecture Guard - Summary.md`
- Security & Auth: `02 - Security & Auth - Summary.md`
- Next.js Runtime: `03 - Next.js Runtime - Summary.md`
- Validation Strategy: `05 - Validation Strategy - Summary.md`
- Debug Investigation: `06 - Debug Investigation - Summary.md`
- orchestrating planning step: creates `implementation-plan.md` when execution needs a concrete scenario-by-scenario or step-by-step plan
- Implementation Agent: `04 - Implementation Agent - Summary.md`
- Playwright E2E: `07 - Playwright E2E - Summary.md`
- final verification step: `validation-report.md`

The Workflow Orchestrator is intentionally excluded from the per-agent summary-file rule because it already owns the control artifacts.

If a specialist is skipped, record the reason in `plan.md`.

---

## How To Use These Artifacts

Each later step should:

- read the earlier relevant artifacts
- preserve constraints already established
- avoid silently re-deciding a question already settled earlier
- document any disagreement or block explicitly
- update the control artifacts to reflect new status before handing off to the next agent or phase

Artifacts are meant to reduce ambiguity and preserve handoff quality.

Keep task artifacts derived and concise.
Do not duplicate large requirement docs into `.copilot/tasks/`.
Instead, store the source requirements in their proper repository location and reference them from `intake.md`.
When practical, make execution-oriented artifacts actively usable during delivery by adding checkboxes rather than leaving them as prose only.

---

## Auth-Flow Tasks

For any Clerk/bootstrap/onboarding task, the task workspace should also reference:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

If Playwright E2E is used, map the run results back to matrix scenario IDs.

Do not mark the task complete unless the affected scenarios are explicitly checked or clearly marked as deferred/blocked.

---

## Best Place To Find Task Artifacts

Look in:

- `.copilot/tasks/`

Each task should have its own folder.
Open `plan.md` first.

That file should tell you:

- what the task is
- which agents were used
- which artifacts were produced
- what remains open

---

## Practical Recommendation

For Copilot, the best model is:

- one orchestrating step creates the task directory and `plan.md`
- specialist agents add their artifacts into the same folder
- implementation and validation append evidence instead of replacing earlier artifacts

This gives you a single per-task dossier instead of scattered chat-only state.

## Universal Operating Model

The reusable system should stay generic:

- agents define specialist responsibilities
- prompts define reusable entrypoints
- task-specific requirements stay in task-specific documents or attached files

In practice, that means:

- do not create one-off prompts for a single feature unless the workflow is expected to repeat materially
- prefer a universal orchestrator prompt that consumes a task brief, referenced files, and attached context
- prefer a universal Playwright E2E prompt that consumes task-specific scenario sources such as matrices, checklists, or requirement docs
- let `.copilot/tasks/{task_id}/intake.md` and `implementation-plan.md` adapt the generic system to the specific task
