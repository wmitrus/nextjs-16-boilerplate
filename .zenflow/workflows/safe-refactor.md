# Safe Refactor Workflow

## Configuration

- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

## Workflow Steps

### [ ] Step: Refactor Intake

Understand the refactor goal and define invariants.

Document:

- refactor classification
- expected unchanged behavior
- affected modules
- known architecture smells
- constraints or assumptions

Output file:

{@artifacts_path}/refactor-intake.md

### [ ] Step: Architecture Review

Run **Architecture Guard Agent**.

Use this template as the output structure guide:

docs/ai/templates/architecture-review-template.md

The agent must determine:

- architecture fit
- affected layers
- affected modules
- dependency direction impact
- boundary risks
- provider isolation risks
- architecture constraints

Output file:

{@artifacts_path}/architecture-review.md

### [ ] Step: Security Review (Conditional)

If the refactor touches:

- auth flows
- authorization
- tenancy / organization logic
- provider integrations
- sensitive data handling
- trust boundaries

Run **Security/Auth Agent**.

Use template:

docs/ai/templates/security-review-template.md

The agent must assess:

- auth surface impact
- authorization risks
- tenancy safety
- provider isolation
- sensitive data handling
- security constraints

Output file:

{@artifacts_path}/security-review.md

### [ ] Step: Runtime Review (Conditional)

If the refactor touches:

- src/app/\*
- server actions
- route handlers
- middleware / proxy
- caching / revalidation
- server/client placement
- edge vs node runtime

Run **Next.js Runtime Agent**.

Use template:

docs/ai/templates/runtime-review-template.md

The agent must assess:

- runtime surfaces affected
- server vs client placement
- caching risks
- middleware behavior
- runtime constraints

Output file:

{@artifacts_path}/runtime-review.md

### [ ] Step: Refactor Constraints

Consolidate specialist findings into one implementation brief.

Use template:

docs/ai/templates/constraints-template.md

The summary must include:

- architecture constraints
- security constraints
- runtime constraints
- validation constraints
- explicitly allowed changes
- explicitly forbidden changes
- protected invariants

Output file:

{@artifacts_path}/constraints.md

### [ ] Step: Validation Strategy

Run **Validation Strategy Agent**.

Use template:

docs/ai/templates/validation-template.md

The agent must determine:

- minimum validation required
- optional additional validation
- validation not required
- validation commands to run
- validation gaps

Output file:

{@artifacts_path}/validation-strategy.md

### [ ] Step: Implementation

Run **Implementation Agent**.

Inputs:

- {@artifacts_path}/refactor-intake.md
- {@artifacts_path}/architecture-review.md
- {@artifacts_path}/security-review.md (if present)
- {@artifacts_path}/runtime-review.md (if present)
- {@artifacts_path}/constraints.md
- {@artifacts_path}/validation-strategy.md

The agent must:

- apply minimal safe refactor
- preserve behavior
- avoid opportunistic redesign
- update tests if required

Output file:

{@artifacts_path}/implementation-report.md

### [ ] Step: Validation

Run validation defined in:

{@artifacts_path}/validation-strategy.md

Document:

- commands executed
- test results
- typecheck/lint results
- architecture lint result
- whether behavior is preserved

Output file:

{@artifacts_path}/validation-report.md

### [ ] Step: Final Architecture Check

Run **Architecture Guard Agent** again.

Confirm:

- no dependency drift
- boundaries still respected
- architecture constraints preserved

Output file:

{@artifacts_path}/architecture-final.md
