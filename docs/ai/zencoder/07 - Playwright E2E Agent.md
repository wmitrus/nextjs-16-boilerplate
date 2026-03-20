## What it does

Prompt source used by Zencoder: [docs/ai/general/07 - Playwright E2E Agent.md](../general/07%20-%20Playwright%20E2E%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Defines `07 - Playwright E2E` as the real-browser verification specialist for this repository
- Focuses on task-driven browser flows, redirects, cookies, hydration, route transitions, and scenario-level evidence capture
- Uses the task's matrix, checklist, acceptance list, or verification source as the authority for what to test

## When to use it

- When unit or integration tests are not enough and browser-real evidence is required
- When auth/bootstrap/onboarding behavior must be verified in a real browser
- When redirects, cookies, hydration, or route settlement are part of the risk
- When Validation Strategy or Debug Investigation concludes that Playwright E2E is required

## General E2E Note

For any orchestrated task:

- read the task artifacts created by the active ZenFlow workflow first
- use the task's requirement docs, checklists, or scenario matrix as the verification source of truth
- if an implementation plan exists, use it to understand intended scenario coverage and sequencing

## Auth-Flow Note

For any auth/bootstrap/onboarding E2E verification:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` to structure the run artifact when relevant

## Related ZenFlow workflows

- any workflow under `.zenflow/workflows/` when browser evidence is required for that task
