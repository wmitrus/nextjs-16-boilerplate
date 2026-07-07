---
description: 'Run focused real-browser Playwright validation for the current task using the task brief, attached files, and any provided verification checklist.'
name: 'Playwright E2E Validation'
argument-hint: 'Task context, scenario checklist, referenced files, risks, or environment notes to emphasize'
agent: '07 - Playwright E2E'
---

> **Leantime Integration Required**
> At task open and close, invoke the `10 - Leantime Integration Agent`.
> Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

Run `07 - Playwright E2E` for the current task.

Required workflow:

- If this task has a `.copilot/tasks/{task_id}/` workspace, read `plan.md`, `intake.md`, `constraints.md`, and `implementation-plan.md` when present.
- Treat the user request, attached files, and referenced repository documents as the task input package.
- If the task adds or refactors E2E coverage, read `docs/usage/05 - Playwright E2E Architecture.md` before changing test placement or fixtures.
- If the task includes a scenario matrix, checklist, acceptance list, or verification document, use it as the mandatory scenario source.
- For auth/bootstrap/onboarding work, also read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`, `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`, and `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`.
- For auth/bootstrap/onboarding verification runs, structure the artifact with `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`.

Execution expectations:

- Determine the smallest Playwright scope that still verifies the affected browser scenarios.
- Treat `scripts/e2e/run-scenario.mjs` as the authority for the browser-test origin. The default local E2E origin is `http://localhost:3100`, separate from the normal developer app on `http://localhost:3000`.
- Classify scenarios into the repository E2E architecture before changing auth setup or creating a new spec: public route, interactive auth flow, steady-state authenticated suite, or mixed matrix coverage.
- Classify scenarios before altering auth setup: use shared authenticated state only for steady-state checks; keep fresh interactive flows for sign-in/bootstrap/onboarding/sign-out/session-reentry semantics.
- If the route is public, demo, or explicitly allowed for E2E access without auth, do not add Clerk/AuthJS setup unless authenticated behavior is the scenario under test.
- For mixed files, separate flow-based and steady-state cases instead of forcing one fixture model across the entire suite.
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
