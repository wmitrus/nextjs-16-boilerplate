# Incident Investigation Workflow

## Configuration

- **Artifacts Path**: {@artifacts_path} → `.zencoder/chats/{chat_id}`

---

## Before Running

Before starting this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

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

### [ ] Step: Incident Intake

Collect the initial report and environment details.

Output:
{@artifacts_path}/incident-intake.md

Include:

- symptom
- environment
- reproduction steps
- logs or screenshots

---

### [ ] Step: Flow Trace Investigation

Trace the execution path through the system.

Output:
{@artifacts_path}/flow-trace.md

Include:

- entry points
- state transitions
- identity/tenant context
- redirect flow
- likely divergence points

---

### [ ] Step: Runtime Behavior Review

Analyze runtime behavior and framework interaction.

Output:
{@artifacts_path}/runtime-review.md

Focus on:

- server vs client boundaries
- server actions
- redirects
- middleware / proxy behavior
- caching / rendering

---

### [ ] Step: Architecture Impact Review

Verify that the suspected fix does not violate architecture rules.

Output:
{@artifacts_path}/architecture-review.md

Confirm:

- module boundaries respected
- DI usage correct
- no security or auth regressions
- runtime placement correct

---

### [ ] Step: Remediation Plan

Define the smallest safe fix.

Output:
{@artifacts_path}/remediation-plan.md

Include:

- change scope
- affected files
- expected behavior change
- risks

---

### [ ] Step: Validation Strategy

Run **Validation Strategy Agent** to determine the minimum safe validation scope for the remediation.

Output:
{@artifacts_path}/validation-strategy.md

Include:

- change risk classification
- minimum required validation
- optional additional validation
- validation not required
- validation commands or checks

---

### [ ] Step: Implementation

Apply the fix and update tests if needed.

Output:
{@artifacts_path}/implementation-report.md

Include:

- files changed
- logic changes
- tests updated

---

### [ ] Step: Validation

Run repository validation commands.

Output:
{@artifacts_path}/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm arch:lint
- pnpm test
