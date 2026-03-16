# Incident Investigation Workflow

## Configuration

- **Artifacts Path**: /home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32 → `docs/workflows/{task_id}`

---

## Workflow Steps

### [ ] Step: Incident Intake

Collect the initial report and environment details.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/incident-intake.md

Include:

- symptom
- environment
- reproduction steps
- logs or screenshots

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output:` is mandatory
- the active agent must create or overwrite that markdown file
- the artifact file must contain the full result for the step
- the agent must not respond only in chat without writing the artifact
- after writing the artifact, the agent should give only a short completion summary in chat

---

### [ ] Step: Flow Trace Investigation

Trace the execution path through the system.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/flow-trace.md

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
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/runtime-review.md

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
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/architecture-review.md

Confirm:

- module boundaries respected
- DI usage correct
- no security or auth regressions
- runtime placement correct

---

### [ ] Step: Remediation Plan

Define the smallest safe fix.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/remediation-plan.md

Include:

- change scope
- affected files
- expected behavior change
- risks

---

### [x] Step: Implementation

Apply the fix and update tests if needed.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/implementation-report.md

Include:

- files changed
- logic changes
- tests updated

---

### [ ] Step: Validation

Run repository validation commands.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm arch:lint
- pnpm test

---

### [x] Ad-hoc: PGlite vs Postgres Bootstrap Divergence Analysis

Deep investigation comparing PGlite and local dev Postgres execution paths for /auth/bootstrap.

Output:
/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/bootstrap-pglite-vs-postgres-analysis.md

Status: COMPLETE
