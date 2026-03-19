---
applyTo: '**'
description: 'Use during non-trivial Copilot work to create a per-task artifact folder with a plan and specialist outputs.'
---

For non-trivial work, Copilot must create a task workspace under:

- `.copilot/tasks/{task_id}/`

Task workspace rules:

- create one directory per task
- create `plan.md` first before specialist analysis or implementation begins
- each specialist agent must save its output as a separate artifact in the same task directory
- later steps must read earlier relevant artifacts instead of silently re-deriving them

Minimum expected files when relevant:

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

For auth/bootstrap/onboarding work that uses Playwright, prefer structuring the E2E artifact with:

- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

If a step is skipped, record that explicitly in `plan.md` or the relevant artifact rather than omitting it silently.

Use repository docs to explain the artifact system rather than inventing per-task conventions ad hoc.
