> **THIS FILE IS A DESCRIPTION GUIDE - NOT THE REAL SKILL.**
> The real Claude Code skill that controls behavior is:
> **`.claude/skills/playwright-e2e/SKILL.md`**
> (Codex's equivalent: `.agents/skills/playwright-e2e/SKILL.md`.)
> All rule changes, E2E rules, and behavioral updates must be applied to that file and
> the shared authority docs.

## What it does

Real Claude skill file: [`.claude/skills/playwright-e2e/SKILL.md`](../../../.claude/skills/playwright-e2e/SKILL.md) (Codex equivalent: [`.agents/skills/playwright-e2e/SKILL.md`](../../../.agents/skills/playwright-e2e/SKILL.md))

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
- `docs/usage/05 - Playwright E2E Architecture.md` when adding or refactoring E2E coverage
- `scripts/e2e-clerk-fixtures.md`, `e2e/clerk-auth.ts`, and `e2e/runtime-profile.ts` before changing Clerk auth/bootstrap/provisioning fixture setup

For auth-flow work, it also reads:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

## Session-Reuse Decision Rule

- Shared authenticated state is for steady-state scenarios only, where the assertion target is behavior after auth/bootstrap/onboarding has already settled.
- Fresh interactive flow is required when the scenario validates sign-in, sign-up, bootstrap, onboarding, sign-out, session re-entry, tenant/org selection, or auth-driven redirects.
- Public, demo, and explicitly E2E-allowed routes must stay unauthenticated unless authenticated behavior is itself the subject under test.
- Mixed files should be split by scenario semantics before optimization rather than forcing one fixture model across the entire suite.
- New specs should be mapped into the existing suite families from `docs/usage/05 - Playwright E2E Architecture.md` before creating a parallel test surface.
- Clerk fixtures keep a stable/generated split: env-driven users and org/provider organizations are reconciled and reused, while generated hosted sign-up users and empty default orgs are cleaned with strict predicates.

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
