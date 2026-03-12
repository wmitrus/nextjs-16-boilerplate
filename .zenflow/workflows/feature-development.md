# Feature Development Workflow

## Configuration

- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

## Workflow Steps

### [ ] Step: Feature Intake

Understand the requested feature before any design or implementation.

Document:

- feature description
- expected user-visible behavior
- affected modules or features
- assumptions and unknowns
- initial scope boundaries

Output file:

{@artifacts_path}/feature-intake.md

### [ ] Step: Architecture Design

Run **Architecture Guard Agent**.

Use this template as the output structure guide:

docs/ai/templates/architecture-review-template.md

The agent must determine:

- architectural fit of the feature
- affected layers
- affected modules
- dependency direction impact
- required new contracts or services
- boundary risks
- provider isolation implications
- architectural constraints

Output file:

{@artifacts_path}/architecture-review.md

### [ ] Step: Security Review (Conditional)

If the feature touches:

- authentication
- authorization
- tenancy / organization logic
- provider integrations
- sensitive data handling
- trust boundaries
- internal APIs

Run **Security/Auth Agent**.

Use template:

docs/ai/templates/security-review-template.md

The agent must assess:

- auth surface
- authorization enforcement
- tenant isolation risks
- provider isolation
- sensitive data handling
- trust boundaries
- security constraints

Output file:

{@artifacts_path}/security-review.md

### [ ] Step: Runtime Review (Conditional)

If the feature touches:

- src/app/\*
- server actions
- route handlers
- middleware / proxy
- caching / revalidation
- server/client placement
- edge vs node runtime
- environment variables

Run **Next.js Runtime Agent**.

Use template:

docs/ai/templates/runtime-review-template.md

The agent must assess:

- runtime surfaces affected
- server vs client placement
- route handler / server action behavior
- middleware implications
- caching and revalidation behavior
- edge vs node runtime
- env exposure risks
- runtime constraints

Output file:

{@artifacts_path}/runtime-review.md

### [ ] Step: Feature Constraints

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

- the minimum validation required
- optional additional validation
- validation not required
- validation commands to run
- validation gaps

Output file:

{@artifacts_path}/validation-strategy.md

### [ ] Step: Implementation

Run **Implementation Agent**.

The agent must read these artifacts before implementation:

- {@artifacts_path}/feature-intake.md
- {@artifacts_path}/architecture-review.md
- {@artifacts_path}/security-review.md (if present)
- {@artifacts_path}/runtime-review.md (if present)
- {@artifacts_path}/constraints.md
- {@artifacts_path}/validation-strategy.md

The implementation must:

- follow constraints from constraints.md
- preserve architecture boundaries
- avoid introducing cross-module coupling
- implement the feature with minimal blast radius
- update tests when required

Output file:

{@artifacts_path}/implementation-report.md

### [ ] Step: Validation

Run validation defined in:

{@artifacts_path}/validation-strategy.md

Document:

- commands executed
- test results
- typecheck and lint results
- architecture lint results
- verification of expected feature behavior

Output file:

{@artifacts_path}/validation-report.md

### [ ] Step: Final Architecture Check

Run **Architecture Guard Agent** again.

Confirm:

- module boundaries remain intact
- dependency direction rules remain respected
- provider isolation is preserved
- no structural drift occurred

Output file:

{@artifacts_path}/architecture-final.md
