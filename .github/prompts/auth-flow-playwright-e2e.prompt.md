---
description: 'Run focused real-browser Playwright verification for auth/bootstrap/onboarding flows and map the results to the auth-flow verification matrix.'
name: 'Auth Flow Playwright E2E'
argument-hint: 'Affected auth-flow scenarios, files, risks, or environment notes to emphasize'
agent: '07 - Playwright E2E'
---

Run `07 - Playwright E2E` for the current auth/bootstrap/onboarding change.

Required auth-flow context:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- structure the run artifact using `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

Workflow:

- Determine the changed files and the auth-flow scenarios most likely affected.
- Select the smallest Playwright scope that still verifies the affected scenarios in a real browser.
- Run the relevant Playwright command(s).
- Record the scenario outcomes against the matrix.
- Capture the strongest evidence available: final URL, key runtime signals, report path, trace path, screenshots, or logs.

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

Do not mark the flow verified unless the affected scenarios are explicitly checked or clearly marked as deferred/blocked.
