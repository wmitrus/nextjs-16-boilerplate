# Auth Flow Change Review Workflow

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `security-auth-agent`
  - `nextjs-runtime-agent`
  - `architecture-guard-agent`
  - `playwright-e2e-agent`

## Before Running

Before starting this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
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

### [ ] Step: Change Intake

Determine the changed file set and identify all auth/bootstrap/onboarding paths at risk.

Output:
{@artifacts_path}/auth-change-intake.md

Include:

- changed file set (from working tree or provided diff)
- auth/bootstrap/onboarding/proxy/route-handler/server-action/layout paths touched
- trust-boundary, redirect-flow, and runtime-sensitive surfaces at risk
- initial scope: which agents will likely be needed

---

### [ ] Step: Auth Surface Analysis

<!-- agent: security-auth-agent -->

Run **Security/Auth Agent**.

Read before analysis:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

Output:
{@artifacts_path}/auth-surface-analysis.md

Include:

- changed files considered
- trust-boundary assessment
- affected AUTH_FLOW_VERIFICATION_MATRIX scenario IDs with reason for each
- relevant anti-patterns from AUTH_FLOW_ANTI_PATTERNS.md
- required verification before sign-off
- conditional routing recommendation (Runtime Review needed? Architecture Review needed?)

---

### [ ] Step: Runtime Behavior Review (Conditional)

<!-- agent: nextjs-runtime-agent -->

Run this step only if the change touches:

- routing behavior in `src/proxy.ts` or App Router
- server/client boundary placement for auth-gated components
- caching or revalidation of auth-sensitive data
- edge vs node runtime placement for auth logic

Run **Next.js Runtime Agent**.

Use template:

`docs/ai/templates/runtime-review-template.md`

Output:
{@artifacts_path}/runtime-review.md

Include:

- runtime surfaces at risk in the auth path
- server/client placement assessment
- caching/revalidation risks
- runtime constraints

---

### [ ] Step: Architecture Impact Review (Conditional)

<!-- agent: architecture-guard-agent -->

Run this step only if the change may affect:

- module boundaries in `src/modules/auth/` or `src/security/`
- DI/composition of auth dependencies
- provider isolation boundaries
- security enforcement layer placement

Run **Architecture Guard Agent**.

Use template:

`docs/ai/templates/architecture-review-template.md`

Output:
{@artifacts_path}/architecture-review.md

Include:

- architecture fit of the change
- module boundary assessment
- DI/composition assessment
- architecture constraints

---

### [ ] Step: Matrix Verification Sign-Off

For each matrix scenario ID identified in the Auth Surface Analysis step, state:

- scenario description
- verification status: **Verified** / **Deferred** / **Blocked**
- reason for the status
- for Deferred: what must happen before verification
- for Blocked: the explicit blocker

Do not proceed to Playwright Verification unless all scenarios are Verified or explicitly Deferred/Blocked.

Output:
{@artifacts_path}/matrix-verification.md

Include:

- scenario ID table with status and reason per scenario
- overall sign-off status (Signed Off / Deferred / Blocked)
- any residual risks

---

### [ ] Step: Playwright E2E Verification (Conditional)

<!-- agent: playwright-e2e-agent -->

Run this step only if browser-level evidence is required to verify matrix scenarios that cannot be confirmed through code review alone.

Triggers:

- redirect-flow scenarios that depend on browser behavior
- cookie or session behavior that requires a real browser
- onboarding/bootstrap flows spanning multiple route transitions

Run **Playwright E2E Agent**.

Use template:

`docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

Output:
{@artifacts_path}/playwright-verification.md

Include:

- commands run
- scenario status mapping (Pass/Fail/Blocked per scenario)
- evidence collected (URLs, logs, screenshots)
- gaps / deferred checks
