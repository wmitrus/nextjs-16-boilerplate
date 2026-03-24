# Playwright E2E Validation Workflow

## Configuration

- **Artifacts Path**: {@artifacts_path} → `.zencoder/chats/{chat_id}`

## Before Running

Before starting this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

For auth/bootstrap/onboarding verification, also read:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output:` is mandatory
- the active agent must create or overwrite that markdown file
- the artifact file must contain the full result for the step
- the agent must not respond only in chat without writing the artifact
- after writing the artifact, the agent should give only a short completion summary in chat

---

## Workflow Steps

### [ ] Step: Verification Intake

Collect task context, scenario checklist, affected paths, and environment notes.

If an active task workspace exists, read: `plan.md`, `intake.md`, `constraints.md`, and `implementation-plan.md` when present.

For auth/bootstrap/onboarding work, structure the artifact with `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`.

Output:
{@artifacts_path}/verification-intake.md

Include:

- task context and goals
- scenario checklist or source (e.g., AUTH_FLOW_VERIFICATION_MATRIX.md)
- affected URL paths and flows
- environment constraints

---

### [ ] Step: Scenario Scope Definition

Identify the smallest Playwright scope that covers the risk.

Output:
{@artifacts_path}/scenario-scope.md

Include:

- scenarios to test (with ID or description and expected outcome)
- scenarios to defer (with reason)
- scenarios to skip (with reason)

---

### [ ] Step: Precondition Check

Confirm the environment is ready.

Output:
{@artifacts_path}/preconditions.md

Include:

- dev server status and URL
- auth credentials / test user state
- any required seed data or state
- precondition status: Ready / Blocked
- any unmet preconditions with detail

If Blocked: stop the workflow and report the block. Do not proceed to Playwright Execution.

---

### [ ] Step: Playwright Execution

Run the identified scenarios using the minimum effective Playwright scope.

Output:
{@artifacts_path}/playwright-execution.md

Include:

- commands executed (full command strings)
- final URLs observed per scenario
- relevant log or console output
- report or trace file paths
- any screenshots captured

---

### [ ] Step: Evidence Collection

Produce a structured evidence artifact.

Output:
{@artifacts_path}/evidence-report.md

Include:

- scenario status table: scenario ID/description | Pass / Fail / Blocked | Evidence reference
- summary counts: X passed, Y failed, Z blocked
- per-scenario evidence: URL, log snippet, screenshot reference, or trace path

---

### [ ] Step: Gap Report

Explicitly state all deferred or blocked scenarios.

Output:
{@artifacts_path}/gap-report.md

Include:

- deferred scenario list: scenario ID/description | reason | what would be required to verify
- blocked scenario list: scenario ID/description | blocker description
- recommended next action
- if no gaps: state explicitly that all in-scope scenarios were verified
