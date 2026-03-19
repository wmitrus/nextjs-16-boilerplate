---
description: 'Run focused real-browser Playwright validation for the current task using the task brief, attached files, and any provided verification checklist.'
name: 'Playwright E2E Validation'
argument-hint: 'Task context, scenario checklist, referenced files, risks, or environment notes to emphasize'
agent: '07 - Playwright E2E'
---

Run `07 - Playwright E2E` for the current task.

Required workflow:

- If this task has a `.copilot/tasks/{task_id}/` workspace, read `plan.md`, `intake.md`, `constraints.md`, and `implementation-plan.md` when present.
- Treat the user request, attached files, and referenced repository documents as the task input package.
- If the task includes a scenario matrix, checklist, acceptance list, or verification document, use it as the mandatory scenario source.
- For auth/bootstrap/onboarding work, also read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`, `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`, and `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`.
- For auth/bootstrap/onboarding verification runs, structure the artifact with `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`.

Execution expectations:

- Determine the smallest Playwright scope that still verifies the affected browser scenarios.
- Explicitly state which scenarios were tested, deferred, or blocked.
- Record concrete evidence: commands, final URLs, logs, reports, traces, screenshots, and scenario mapping.
- Do not mark the task verified unless the required scenarios were actually checked or explicitly deferred/blocked.

Required output:

1. Objective
2. Scenarios Under Test
3. Preconditions
4. Commands Run
5. Observed Results
6. Scenario Status Mapping
7. Evidence Collected
8. Gaps / Deferred Checks
9. Recommended Next Action
