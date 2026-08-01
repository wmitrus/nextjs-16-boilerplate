> **THIS FILE IS A DESCRIPTION GUIDE — NOT THE AGENT.**
> The real Copilot agent that controls actual behavior is:
> **`.github/agents/playwright-e2e.agent.md`**
> All rule changes, security rules, and behavioral updates MUST be applied to that file.
> Content added here does NOT affect how the Copilot agent behaves.

## What it does

Real agent file: [`.github/agents/playwright-e2e.agent.md`](../../../.github/agents/playwright-e2e.agent.md)

- Defines `07 - Playwright E2E` as a real-browser verification specialist for this repository
- Focuses on:
  - task-driven browser flows defined by requirements, matrices, or checklists
  - cookies, redirects, hydration, and route transitions
  - Playwright scenario execution against real browser behavior
  - mapping observed results back to the task's verification source of truth
- Uses `read`, `search`, and `execute`, so it can inspect the repo and run targeted Playwright commands without drifting into implementation
- Returns browser-verification results in a stable E2E shape:
  - Objective
  - Scenarios Under Test
  - Preconditions
  - Commands Run
  - Observed Results
  - Scenario Status Mapping
  - Evidence Collected
  - Gaps / Deferred Checks
  - Recommended Next Action

## When to use it

- When unit or integration tests are not enough and browser-realistic evidence is required
- When the task already defines browser scenarios in requirements, a matrix, or a checklist
- When auth/bootstrap/onboarding behavior must be verified in a real browser
- When redirects, cookies, hydration, or route-commit behavior are part of the risk
- When Validation Strategy or Debug Investigation concludes that Playwright E2E is required

## General E2E Note

For any orchestrated task:

- read the task's `plan.md` and `intake.md` first
- use the task's requirement docs, checklists, or scenario matrix as the verification source of truth
- if `implementation-plan.md` exists, use it to understand intended scenario coverage and sequencing
- if the task adds or restructures E2E coverage, read `docs/usage/05 - Playwright E2E Architecture.md` before deciding where the spec belongs or which fixture model it should use
- before changing Clerk auth/bootstrap/provisioning fixture setup, read `scripts/e2e-clerk-fixtures.md`, `e2e/clerk-auth.ts`, and `e2e/runtime-profile.ts`

## Auth-Flow Note

For any auth/bootstrap/onboarding E2E verification:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` to structure the run artifact

## Session-Reuse Decision Rule

- Shared authenticated state is for steady-state scenarios only, where the assertion target is behavior after auth/bootstrap/onboarding has already settled.
- Fresh interactive flow is required when the scenario validates sign-in, sign-up, bootstrap, onboarding, sign-out, session re-entry, tenant/org selection, or auth-driven redirects.
- Public, demo, and explicitly E2E-allowed routes must stay unauthenticated unless authenticated behavior is itself the subject under test.
- Mixed files should be split by scenario semantics before optimization rather than forcing one fixture model across the entire suite.
- New specs should be mapped into the existing suite families from `docs/usage/05 - Playwright E2E Architecture.md` before creating a parallel test surface.
- Clerk fixtures keep a stable/generated split: env-driven users and org/provider organizations are reconciled and reused, while generated hosted sign-up users and empty default orgs are cleaned with strict predicates.

## Example prompts to try

- "Run Playwright E2E validation for this task using the attached scenario checklist."
- "Verify the onboarding redirect flow in a real browser and map results to the provided matrix."
- "Run Chromium verification for this workflow task and capture evidence."
- "Check the high-risk browser scenarios from the task brief and report the gaps."

## Available slash prompt

Real prompt file: [playwright-e2e-validation.prompt.md](../../../.github/prompts/playwright-e2e-validation.prompt.md)

```bash
/Playwright E2E Validation
```
