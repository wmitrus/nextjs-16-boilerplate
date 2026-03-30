# Change Validation Workflow

## Configuration

- **Artifacts Path**: /home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/417c6f22-418a-4cf6-b8ea-20f2e6949258 → `.zencoder/chats/{chat_id}`

## Before Running

Before starting this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

For auth/bootstrap/onboarding changes, also read:

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

### [x] Step: Change Intake

Determine the changed file set and identify affected validation surfaces.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/417c6f22-418a-4cf6-b8ea-20f2e6949258/change-intake.md

Include:

- changed file set (from working tree or provided diff)
- affected tests, configs, workflows, and validation tooling
- any user-provided risk notes or context
- for auth changes: reference to AUTH_FLOW_VERIFICATION_MATRIX.md

---

### [x] Step: Validation Risk Assessment

Run **Validation Strategy Agent** to classify the change risk.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/417c6f22-418a-4cf6-b8ea-20f2e6949258/validation-risk.md

Include:

- change risk classification
- risk dimensions:
  - does the change affect auth, trust boundaries, or tenancy? (elevated)
  - does the change affect module boundaries or DI/composition? (architecture risk)
  - does the change affect server/client placement, routing, or caching? (runtime risk)
  - does the change have existing test coverage? (coverage gap risk)

---

### [x] Step: Scope Definition

Produce three explicit validation tier lists.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/417c6f22-418a-4cf6-b8ea-20f2e6949258/validation-scope.md

Include:

**Minimum required validation** (must pass before change is considered safe):

- specific test commands
- specific scenarios to verify
- typecheck and lint if applicable

**Optional additional validation** (recommended but not blocking):

- broader tests justified by risk level
- integration or E2E tests when warranted

**Validation not required** (explicitly excluded):

- test layers that do not touch the changed surface
- checks already confirmed safe in the current session

---

### [x] Step: Validation Execution

Run the minimum required validation commands.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/417c6f22-418a-4cf6-b8ea-20f2e6949258/validation-execution.md

Include:

- commands run (full command strings)
- exit code per command
- relevant output lines (pass/fail indicators, error messages)
- per-command status: Pass / Fail / Blocked

If a command fails: state the failure explicitly. Do not mark validation complete.

---

### [x] Step: Result Report

Consolidate validation results.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/417c6f22-418a-4cf6-b8ea-20f2e6949258/validation-report.md

Include:

- overall validation status: Pass / Fail / Blocked
- failing or blocked checks with details
- open validation gaps
- recommended next action
