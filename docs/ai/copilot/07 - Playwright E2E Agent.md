## What it does

Real agent file: [playwright-e2e.agent.md](../../../.github/agents/playwright-e2e.agent.md)

- Defines `07 - Playwright E2E` as a real-browser verification specialist for this repository
- Focuses on:
  - auth/bootstrap/onboarding browser flows
  - cookies, redirects, hydration, and route transitions
  - Playwright scenario execution against real browser behavior
  - mapping observed results back to the auth-flow verification matrix
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
- When auth/bootstrap/onboarding behavior must be verified in a real browser
- When redirects, cookies, hydration, or route-commit behavior are part of the risk
- When Validation Strategy or Debug Investigation concludes that Playwright E2E is required

## Auth-Flow Note

For any auth/bootstrap/onboarding E2E verification:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` to structure the run artifact

## Example prompts to try

- "Run focused Playwright E2E for the affected auth-flow scenarios."
- "Verify the onboarding redirect flow in a real browser and map results to the matrix."
- "Run Chromium verification for the auth bootstrap change and capture evidence."
- "Check whether the `/users -> /onboarding` race is really gone in Playwright."

## Available slash prompt

Real prompt file: [auth-flow-playwright-e2e.prompt.md](../../../.github/prompts/auth-flow-playwright-e2e.prompt.md)

```bash
/Auth Flow Playwright E2E
```
