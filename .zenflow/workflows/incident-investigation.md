# Incident Investigation Workflow

## Configuration

- **Artifacts Path**: {@artifacts_path} → `docs/workflows/{task_id}`

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
