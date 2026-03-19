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
3. add specialist artifacts as the task progresses
4. preserve the implementation and validation evidence in the same directory

The first artifact must be:

- `plan.md`

It should describe:

- task objective
- likely affected areas
- expected specialist sequence
- known risks or unknowns
- artifact list for the task

---

## Recommended File Set

Create only the files that are relevant, but prefer stable names.

Common files:

- `plan.md`
- `intake.md`
- `architecture-review.md`
- `security-review.md`
- `runtime-review.md`
- `validation-strategy.md`
- `constraints.md`
- `implementation-report.md`
- `validation-report.md`
- `playwright-e2e-report.md`

For auth-flow real-browser verification, prefer also using:

- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

as the content template for:

- `playwright-e2e-report.md`

---

## Recommended Ownership

- first orchestrating step: creates `plan.md`
- Architecture Guard: `architecture-review.md`
- Security & Auth: `security-review.md`
- Next.js Runtime: `runtime-review.md`
- Validation Strategy: `validation-strategy.md`
- Implementation Agent: `implementation-report.md`
- Playwright E2E: `playwright-e2e-report.md`
- final verification step: `validation-report.md`

If a specialist is skipped, record the reason in `plan.md`.

---

## How To Use These Artifacts

Each later step should:

- read the earlier relevant artifacts
- preserve constraints already established
- avoid silently re-deciding a question already settled earlier
- document any disagreement or block explicitly

Artifacts are meant to reduce ambiguity and preserve handoff quality.

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
