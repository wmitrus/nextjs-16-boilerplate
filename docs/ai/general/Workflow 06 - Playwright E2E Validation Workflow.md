# Workflow 06 - Playwright E2E Validation Workflow

Purpose:
Execute focused real-browser Playwright verification for task-driven flows that require browser evidence — capturing scenario status, evidence, and gaps in a structured artifact.

This workflow is platform-agnostic and may be used in Copilot, Zencoder, or similar agent environments.

Mode ID:

- `playwright-e2e-validation`

Available agents:

- Playwright E2E Agent

Before running this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

Repository note:

In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

==================================================
WORKFLOW GOAL
==================================================

Use this workflow when browser-level evidence is required to verify task-driven scenarios — especially for auth flows, onboarding, redirect chains, cookie behavior, hydration, or route transitions.

The workflow must:

- identify the smallest Playwright scope that covers the affected scenarios
- explicitly map each scenario to a status: Pass / Fail / Blocked
- capture structured evidence: commands, URLs, logs, reports, screenshots
- not mark the task verified unless required scenarios are checked or explicitly deferred/blocked

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- determine the minimum Playwright scope before running
- explicitly list scenarios to test, defer, and skip
- capture concrete evidence per scenario
- map results to scenario IDs or descriptions
- state gaps / deferred checks with reason

Never:

- run broad test suites when only targeted scenarios are needed
- mark the task verified without explicit scenario status
- substitute code-review conclusions for browser evidence when browser evidence is required
- run Playwright without a precondition check

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- auth/bootstrap/onboarding flows that require redirect-chain verification
- cookie or session behavior that must be proven in a real browser
- route transitions, hydration, or browser-specific behavior
- post-implementation browser verification of a security or auth fix
- scenarios in AUTH_FLOW_VERIFICATION_MATRIX.md that cannot be verified by code review alone

Do not use for:

- unit-testable logic (use focused unit tests instead)
- API-level behavior fully covered by integration tests
- scenarios already verified in a prior Playwright run in the same session

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- task context or feature being verified
- scenario checklist or list of scenarios to verify (or reference to AUTH_FLOW_VERIFICATION_MATRIX.md)
- any relevant environment constraints

Helpful optional inputs:

- specific URL paths to test
- test user credentials or state
- prior Playwright run output to build on
- risk areas to emphasize

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Verification Intake

- Collect task context, scenario checklist, affected paths, and environment notes.
- If an active task workspace exists, read `plan.md`, `intake.md`, `constraints.md`, and `implementation-plan.md` when present.
- For auth/bootstrap/onboarding work, read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`, `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`, and `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`.
- For auth/bootstrap/onboarding verification runs, use `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md` as the artifact structure.
- Produce a verification intake summary.

Step 2. Scenario Scope Definition

- Identify the smallest Playwright scope that covers the risk.
- Explicitly list:
  - scenarios to test (with scenario ID or description)
  - scenarios to defer (with reason)
  - scenarios to skip (with reason)
- State the expected outcome for each scenario under test.

Output required from this step:

- scenario list with test / defer / skip status
- expected outcomes per scenario

Step 3. Precondition Check

- Confirm the environment is ready:
  - dev server is running at the expected URL
  - required auth credentials or test user state are available
  - any required seed data or state is in place
- If a precondition cannot be met, stop and report the block.

Output required from this step:

- precondition status (Ready / Blocked)
- list of any unmet preconditions

Step 4. Playwright Execution

- Run the identified scenarios using the minimum effective Playwright scope.
- Capture for each run:
  - commands executed
  - final URLs observed
  - relevant logs or console output
  - any reports or trace file paths
  - any screenshots captured

Output required from this step:

- commands run
- observed results per scenario

Step 5. Evidence Collection

- Produce a structured evidence artifact.
- For each scenario under test, state:
  - scenario description or ID
  - status: Pass / Fail / Blocked
  - evidence: URL, log snippet, screenshot reference, or trace reference
- Include summary counts: X passed, Y failed, Z blocked.

Output required from this step:

- scenario status mapping
- evidence per scenario

Step 6. Gap Report

- Explicitly state scenarios that were deferred or blocked.
- For each gap, state:
  - the scenario description or ID
  - the reason it was not verified
  - what would be required to verify it
- If no gaps exist, state that explicitly.

Output required from this step:

- deferred/blocked scenario list with reasons
- recommended next action

==================================================
DECISION / BRANCHING RULES
==================================================

Stop before Playwright Execution if:

- any required precondition is not met
- the scenario scope is undefined

Stop before final sign-off if:

- required scenarios are Fail or Blocked without explicit deferral

Always use AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md for auth/bootstrap/onboarding verification artifacts.

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Objective
2. Scenarios Under Test (with status: test / defer / skip)
3. Preconditions
4. Commands Run
5. Observed Results
6. Scenario Status Mapping (Pass / Fail / Blocked per scenario)
7. Evidence Collected
8. Gaps / Deferred Checks
9. Recommended Next Action

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- a required precondition cannot be met
- a required scenario is Fail or Blocked without an approved deferral reason
- the environment prevents meaningful browser execution

==================================================
EXECUTION STYLE
==================================================

Be:

- scenario-driven
- evidence-first
- explicit about status per scenario
- conservative about scope

Do not:

- run broad test suites when targeted scenarios are needed
- report "all tests passed" without scenario-level mapping
- skip the gap report when scenarios are deferred

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- identifies the minimum effective scenario scope
- runs all in-scope scenarios or explicitly defers/blocks each one
- captures concrete per-scenario evidence
- produces a structured evidence artifact
- reports all gaps and deferred items with reasons
