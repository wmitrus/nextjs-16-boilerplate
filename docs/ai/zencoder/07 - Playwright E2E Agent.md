> **THIS FILE IS A DESCRIPTION GUIDE — NOT THE AGENT PROMPT.**
> The real Zencoder prompt source that controls actual behavior is:
> **`docs/ai/general/07 - Playwright E2E Agent.md`**
> All rule changes, security rules, and behavioral updates MUST be applied to that file.
> Content added here does NOT affect how the Zencoder agent behaves.

## What it does

Prompt source used by Zencoder: [**`docs/ai/general/07 - Playwright E2E Agent.md`**](../general/07%20-%20Playwright%20E2E%20Agent.md)

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
- if the task adds or restructures E2E coverage, read `docs/usage/05 - Playwright E2E Architecture.md` before deciding where the spec belongs or which fixture model it should use
- before changing Clerk auth/bootstrap/provisioning fixture setup, read `scripts/e2e-clerk-fixtures.md`, `e2e/clerk-auth.ts`, and `e2e/runtime-profile.ts`

## Auth-Flow Note

For any auth/bootstrap/onboarding E2E verification:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` to structure the run artifact when relevant

## Session-Reuse Decision Rule

- Shared authenticated state is for steady-state scenarios only, where the assertion target is behavior after auth/bootstrap/onboarding has already settled.
- Fresh interactive flow is required when the scenario validates sign-in, sign-up, bootstrap, onboarding, sign-out, session re-entry, tenant/org selection, or auth-driven redirects.
- Public, demo, and explicitly E2E-allowed routes must stay unauthenticated unless authenticated behavior is itself the subject under test.
- Mixed files should be split by scenario semantics before optimization rather than forcing one fixture model across the entire suite.
- New specs should be mapped into the existing suite families from `docs/usage/05 - Playwright E2E Architecture.md` before creating a parallel test surface.
- Clerk fixtures keep a stable/generated split: env-driven users and org/provider organizations are reconciled and reused, while generated hosted sign-up users and empty default orgs are cleaned with strict predicates.

## Example use cases

- "Run the auth-flow verification matrix against the current build in a real browser."
- "Verify that the onboarding redirect sequence is correct after the bootstrap routing change."
- "Confirm that cookies and session state persist correctly across route transitions."
- "Capture browser evidence that the unauthorized access scenario correctly redirects to the sign-in page."
- "Validate that hydration errors do not occur on the protected layout after this server component change."

## Related ZenFlow workflows

- any workflow under `.zenflow/workflows/` when browser evidence is required for that task
