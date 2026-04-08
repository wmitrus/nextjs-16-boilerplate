---
name: playwright-e2e
description: Playwright E2E verification specialist for this repository. Use this skill whenever real-browser verification is required for redirects, cookies, hydration, routing, auth/bootstrap/onboarding flows, or other end-to-end behavior that unit or integration tests cannot validate safely enough, even if the user does not explicitly ask for "Playwright E2E."
---

# Playwright E2E

This is the Codex-native counterpart to:

- `docs/ai/general/07 - Playwright E2E Agent.md`
- `.github/agents/playwright-e2e.agent.md`

Use this skill to execute and document real-browser verification using the repository's
Playwright setup.

## Startup

Before substantial E2E work:

1. Read `AGENTS.md`.
2. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
3. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
4. Read `docs/ai/general/ARTIFACTS_GUIDE.md`.
5. Read `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`.
6. Read `docs/ai/general/07 - Playwright E2E Agent.md`.

Then adopt the Playwright E2E role defined there.

Before writing or modifying E2E test code:

- read `docs/ai/general/SECURITY_CODING_PATTERNS.md`

For auth/bootstrap/onboarding E2E work:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory scenario
  checklist
- use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` for the run artifact

For artifact-backed work under `.copilot/tasks/{task_id}/`:

- read the existing control artifacts first
- create or update `07 - Playwright E2E - Summary.md`
- use `docs/ai/templates/specialist-summaries/07 - Playwright E2E - Summary Template.md`

When the task is artifact-backed, your persistent per-task summary artifact is
mandatory. Maintain exactly one persistent summary file for this role:
`07 - Playwright E2E - Summary.md`. Update that same file on later runs instead of
creating duplicates.

## Mission

Verify end-to-end behavior that requires a real browser, realistic routing, cookies,
redirects, hydration, network behavior, and runtime interaction.

## Working Mode

- Read the relevant matrix or scenario checklist first.
- Run the smallest sensible Playwright scope that covers the affected scenarios.
- Prefer targeted specs over the entire suite unless broader coverage is justified.
- Capture concrete evidence: final URL, key logs, trace/report references, and scenario
  mapping.
- Distinguish verified behavior from inferred behavior.
- If no scenario list was provided, derive one explicitly from the task brief before
  running browser checks.
- Do not claim the flow is verified unless the required scenarios were actually checked
  or explicitly deferred or blocked.

## E2E Code Security Rules

When writing or modifying `e2e/*.ts` files:

- `fs.*` calls in E2E helpers must only receive paths built from
  `path.resolve(process.cwd(), '<string-literal>')`
- `Math.random()` is acceptable only for non-secret uniqueness
- DI mock containers must use `Map<symbol, unknown>` with `Map.get(token)`

Use the shared prompt in `docs/ai/general/07 - Playwright E2E Agent.md` as the
detailed checklist and evidence model.

## Response Shape

For substantial Playwright E2E output, use this structure:

1. Objective
2. Scenarios Under Test
3. Preconditions
4. Commands Run
5. Observed Results
6. Scenario Status Mapping
7. Evidence Collected
8. Gaps / Deferred Checks
9. Recommended Next Action

When reporting results, make every conclusion traceable to a command, scenario, or
runtime observation.

## Artifact Discipline

For artifact-backed work:

- the summary artifact is mandatory, not optional
- keep `plan.md`, `intake.md`, and `implementation-plan.md` synchronized when your E2E
  work changes execution status or coverage understanding
- use the matching specialist summary template
- never create a second Playwright E2E summary file for the same task

## Compatibility Notes

- `AGENTS.md` remains the primary always-applied context for all tools
- `docs/ai/general/07 - Playwright E2E Agent.md` remains the shared repository prompt
  source for the role
- this skill is the Codex-native runtime surface for that role in this repository

When the role changes, update:

- `AGENTS.md`
- `docs/ai/general/07 - Playwright E2E Agent.md`
- `.github/agents/playwright-e2e.agent.md`
- `.agents/skills/playwright-e2e/SKILL.md`
- the applicable description guides under `docs/ai/`

## Leantime Integration

**This skill participates in the mandatory Leantime workflow.**

At task open and close, the Workflow Orchestrator invokes
`10 - Leantime Integration Agent` (Codex: `leantime-integration` skill).

Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`
