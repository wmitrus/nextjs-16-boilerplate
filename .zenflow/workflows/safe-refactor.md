# Safe Refactor Workflow

## Configuration

- **Artifacts Path**: `{@artifacts_path}` -> `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses ZenFlow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**:
  - `architecture-guard-agent`
  - `security-auth-agent`
  - `nextjs-runtime-agent`
  - `validation-strategy-agent`
  - `implementation-agent`

---

## Before Running

Before starting this workflow, read:

- `AGENTS.md`
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

Repository note:

- In Next.js 16, `src/proxy.ts` is the middleware-equivalent file.
- Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
- Do not treat the absence of `middleware.ts` as a finding.

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output file:` is mandatory
- the active agent must create or overwrite that markdown artifact
- the artifact must contain the full result for the step
- the agent should not respond only in chat without writing the artifact first

---

## Leantime Integration

**This workflow must include Leantime steps at task open and close.**

Read: `docs/ai/general/LEANTIME_AUTOMATION.md`

At workflow start, invoke `10 - Leantime Integration Agent` to:

- Check for existing tasks and milestones.
- Create milestone and main task with HTML description.
- Patch status to W toku (4).
- Record task ID in the workflow intake artifact.

At workflow end, invoke `10 - Leantime Integration Agent` to:

- Patch status to Zrobione (0).
- Log time with `pnpm lt -- run time.log`.
- Update wiki if findings should persist.

---

## Workflow Steps

### [ ] Step: Refactor Intake

Understand the refactor goal and define invariants.

Document:

- refactor classification
- expected unchanged behavior
- affected modules
- known architecture smells
- constraints or assumptions
- security-sensitive code touched

Output file:

`{@artifacts_path}/refactor-intake.md`

### [ ] Step: Architecture Review

<!-- agent: architecture-guard-agent -->

Run **Architecture Guard Agent**.

Use this template as the output structure guide:

`docs/ai/templates/architecture-review-template.md`

The agent must determine:

- architecture fit
- affected layers
- affected modules
- dependency direction impact
- boundary risks
- provider isolation risks
- architecture constraints

Output file:

`{@artifacts_path}/architecture-review.md`

### [ ] Step: Security Review (Conditional)

<!-- agent: security-auth-agent -->

If the refactor touches:

- auth flows
- authorization
- tenancy or organization logic
- provider integrations
- sensitive data handling
- trust boundaries

Run **Security/Auth Agent**.

Use template:

`docs/ai/templates/security-review-template.md`

The agent must assess:

- auth surface impact
- authorization risks
- tenancy safety
- provider isolation
- sensitive data handling
- security constraints
- applicable `SECURITY_CODING_PATTERNS.md` rules

Output file:

`{@artifacts_path}/security-review.md`

### [ ] Step: Runtime Review (Conditional)

<!-- agent: nextjs-runtime-agent -->

If the refactor touches:

- `src/app/*`
- server actions
- route handlers
- middleware or proxy
- caching or revalidation
- server/client placement
- Edge vs Node runtime

Run **Next.js Runtime Agent**.

Use template:

`docs/ai/templates/runtime-review-template.md`

The agent must assess:

- runtime surfaces affected
- server vs client placement
- caching risks
- middleware behavior
- runtime constraints

Output file:

`{@artifacts_path}/runtime-review.md`

### [ ] Step: Refactor Constraints

Consolidate specialist findings into one implementation brief.

Use template:

`docs/ai/templates/constraints-template.md`

The summary must include:

- architecture constraints
- security constraints
- runtime constraints
- validation constraints
- explicitly allowed changes
- explicitly forbidden changes
- protected invariants

Output file:

`{@artifacts_path}/constraints.md`

### [ ] Step: Validation Strategy

<!-- agent: validation-strategy-agent -->

Run **Validation Strategy Agent**.

Use template:

`docs/ai/templates/validation-template.md`

The agent must determine:

- minimum validation required
- optional additional validation
- validation not required
- validation commands to run
- validation gaps

Output file:

`{@artifacts_path}/validation-strategy.md`

### [ ] Step: Implementation

<!-- agent: implementation-agent -->

Run **Implementation Agent**.

Inputs:

- `{@artifacts_path}/refactor-intake.md`
- `{@artifacts_path}/architecture-review.md`
- `{@artifacts_path}/security-review.md` if present
- `{@artifacts_path}/runtime-review.md` if present
- `{@artifacts_path}/constraints.md`
- `{@artifacts_path}/validation-strategy.md`

The agent must:

- apply the minimum safe refactor
- preserve behavior
- avoid opportunistic redesign
- update tests if required
- follow applicable `SECURITY_CODING_PATTERNS.md` rules

Output file:

`{@artifacts_path}/implementation-report.md`

### [ ] Step: Validation

Run validation defined in:

`{@artifacts_path}/validation-strategy.md`

Document:

- commands executed
- test results
- typecheck and lint results
- architecture lint result if used
- whether behavior is preserved

Output file:

`{@artifacts_path}/validation-report.md`

### [ ] Step: Final Architecture Check

<!-- agent: architecture-guard-agent -->

Run **Architecture Guard Agent** again.

Confirm:

- no dependency drift
- boundaries still respected
- architecture constraints preserved

Output file:

`{@artifacts_path}/architecture-final.md`

### [ ] Step: Security Patterns Update (Conditional)

<!-- agent: security-auth-agent -->

Run this step only if the refactor touched security-sensitive patterns or introduced a new pattern not already covered in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

Update:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- `AGENTS.md` if a new always-on rule is required
- matching `docs/ai/general/*.md`, `.github/agents/*.agent.md`, and `.zenflow/workflows/*.md` files when propagation is required

Output file:

`{@artifacts_path}/patterns-update-report.md`
