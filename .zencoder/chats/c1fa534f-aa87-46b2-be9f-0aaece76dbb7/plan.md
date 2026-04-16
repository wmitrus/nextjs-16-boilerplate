# Feature Development Workflow

## Configuration

- **Artifacts Path**: `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7` -> `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses ZenFlow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**:
  - `architecture-guard-agent`
  - `security-auth-agent`
  - `nextjs-runtime-agent`
  - `validation-strategy-agent`
  - `implementation-agent`
  - `playwright-e2e-agent`

---

## Before Running

Before starting this workflow, read:

- `AGENTS.md`
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

For auth, bootstrap, or onboarding work, also read:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

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

### [ ] Step: Feature Intake

Understand the requested feature before any design or implementation.

Document:

- feature description
- expected user-visible behavior
- affected modules or features
- assumptions and unknowns
- initial scope boundaries
- auth or security impact
- runtime placement requirements

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/feature-intake.md`

### [ ] Step: Architecture Design

<!-- agent: architecture-guard-agent -->

Run **Architecture Guard Agent**.

Use this template as the output structure guide:

`docs/ai/templates/architecture-review-template.md`

The agent must determine:

- architectural fit of the feature
- affected layers and modules
- dependency direction impact
- required new contracts or services
- boundary risks
- provider isolation implications
- architectural constraints

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/architecture-review.md`

### [ ] Step: Security Review (Conditional)

<!-- agent: security-auth-agent -->

If the feature touches:

- authentication
- authorization
- tenancy or organization logic
- provider integrations
- sensitive data handling
- trust boundaries
- internal APIs

Run **Security/Auth Agent**.

Use template:

`docs/ai/templates/security-review-template.md`

The agent must assess:

- auth surface
- authorization enforcement
- tenant isolation risks
- provider isolation
- sensitive data handling
- trust boundaries
- security constraints
- applicable rules from `docs/ai/general/SECURITY_CODING_PATTERNS.md`

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/security-review.md`

### [ ] Step: Runtime Review (Conditional)

<!-- agent: nextjs-runtime-agent -->

If the feature touches:

- `src/app/*`
- server actions
- route handlers
- middleware or proxy
- caching or revalidation
- server/client placement
- Edge vs Node runtime
- environment variables

Run **Next.js Runtime Agent**.

Use template:

`docs/ai/templates/runtime-review-template.md`

The agent must assess:

- runtime surfaces affected
- server vs client placement
- route handler and server action behavior
- middleware implications
- caching and revalidation behavior
- Edge vs Node runtime
- env exposure risks
- runtime constraints

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/runtime-review.md`

### [ ] Step: Feature Constraints

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

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/constraints.md`

### [ ] Step: Validation Strategy

<!-- agent: validation-strategy-agent -->

Run **Validation Strategy Agent**.

Use template:

`docs/ai/templates/validation-template.md`

The agent must determine:

- the minimum validation required
- optional additional validation
- validation not required
- validation commands to run
- validation gaps

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/validation-strategy.md`

### [ ] Step: Implementation

<!-- agent: implementation-agent -->

Run **Implementation Agent**.

The agent must read these artifacts before implementation:

- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/feature-intake.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/architecture-review.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/security-review.md` if present
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/runtime-review.md` if present
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/constraints.md`
- `/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/validation-strategy.md`

The implementation must:

- follow `constraints.md`
- preserve architecture boundaries
- avoid introducing cross-module coupling
- implement the feature with minimal blast radius
- update tests when required
- follow applicable `SECURITY_CODING_PATTERNS.md` rules

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/implementation-report.md`

### [ ] Step: Validation

Run validation defined in:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/validation-strategy.md`

Document:

- commands executed
- test results
- typecheck and lint results
- architecture lint results if used
- verification of expected feature behavior

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/validation-report.md`

### [ ] Step: E2E Verification (When Required)

<!-- agent: playwright-e2e-agent -->

Run Playwright verification when the feature includes auth flows, routing, or browser-realistic behavior that cannot be closed safely with lower-level validation alone.

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/e2e-report.md`

Include:

- scenarios tested
- commands run
- pass/fail per scenario
- evidence summary

### [ ] Step: Final Architecture Check

<!-- agent: architecture-guard-agent -->

Run **Architecture Guard Agent** again.

Confirm:

- module boundaries remain intact
- dependency direction rules remain respected
- provider isolation is preserved
- no structural drift occurred

Output file:

`/home/wojtek/projects/nextjs-16-boilerplate/.zencoder/chats/c1fa534f-aa87-46b2-be9f-0aaece76dbb7/architecture-final.md`
