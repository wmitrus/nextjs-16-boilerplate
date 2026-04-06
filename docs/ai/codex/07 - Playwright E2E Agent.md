> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Codex skill that controls behavior is:
> **`.agents/skills/playwright-e2e/SKILL.md`**
> All rule changes, E2E rules, and behavioral updates must be applied to that file and
> the shared authority docs.

## What it does

Real Codex skill file: [`.agents/skills/playwright-e2e/SKILL.md`](../../../.agents/skills/playwright-e2e/SKILL.md)

- Specializes in real-browser verification using the repository's Playwright setup
- Focuses on redirects, cookies, hydration, route transitions, auth/bootstrap flows,
  and scenario-mapped browser evidence
- Runs the smallest sensible browser scope and records evidence instead of redesigning
  the system
- Produces the E2E verification summary that later validation or implementation steps
  can rely on

## When to use it

- When unit or integration tests are not enough and browser-realistic evidence is
  required
- When auth/bootstrap/onboarding behavior must be verified in a real browser
- When redirects, cookies, hydration, or route settlement are part of the risk
- When Validation Strategy or Debug Investigation concludes that Playwright E2E is
  required

## Startup Note

The skill reads the shared authority docs first:

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/ARTIFACTS_GUIDE.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/general/07 - Playwright E2E Agent.md`

For auth-flow work, it also reads:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

## Output Shape

For substantial answers, the skill uses:

1. Objective
2. Scenarios Under Test
3. Preconditions
4. Commands Run
5. Observed Results
6. Scenario Status Mapping
7. Evidence Collected
8. Gaps / Deferred Checks
9. Recommended Next Action

## Artifact Discipline

For artifact-backed work, the skill must create or update exactly one persistent
summary artifact:

- `.copilot/tasks/{task_id}/07 - Playwright E2E - Summary.md`

It updates that same file on later runs instead of creating duplicates.

## Example prompts to try

- "Run Playwright E2E validation for this task using the attached scenario checklist."
- "Verify the onboarding redirect flow in a real browser and map results to the provided matrix."
- "Run Chromium verification for this workflow task and capture evidence."
- "Check the high-risk browser scenarios from the task brief and report the gaps."
