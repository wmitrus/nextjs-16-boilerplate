# Feature Development Workflow

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `architecture-guard-agent`
  - `security-auth-agent`
  - `nextjs-runtime-agent`
  - `validation-strategy-agent`
  - `implementation-agent`
  - `playwright-e2e-agent`

---

## Before Running

Before starting this workflow, read:

- `AGENTS.md` (repository root) — primary always-applied context; `.zencoder/rules/repo.md` deprecated April 20, 2026.
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

For auth/bootstrap/onboarding work, also read:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
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

### [ ] Step: Feature Intake

Collect the feature requirements and identify the affected surfaces.

Output:
{@artifacts_path}/feature-intake.md

Include:

- feature objective
- acceptance criteria
- affected modules and files (preliminary estimate)
- auth/security impact (yes/no + reason)
- runtime placement requirements (server/client/edge)
- open questions or blockers

---

### [ ] Step: Architecture Review

<!-- agent: architecture-guard-agent -->

Review the planned feature design for modular-monolith boundary compliance.

Output:
{@artifacts_path}/architecture-review.md

Confirm:

- dependency direction preserved
- module boundaries not crossed
- DI and composition-root discipline maintained
- no provider SDK leakage outside adapters
- contract-first design followed

---

### [ ] Step: Security Review

<!-- agent: security-auth-agent -->

Review the feature for auth, authorization, and trust boundary impact.

Output:
{@artifacts_path}/security-review.md

Confirm:

- authentication boundaries respected
- authorization enforced server-side
- no untrusted input forwarded to sensitive operations
- no violations of `docs/ai/general/SECURITY_CODING_PATTERNS.md` rules

---

### [ ] Step: Runtime Review

<!-- agent: nextjs-runtime-agent -->

Review server/client placement and App Router correctness.

Output:
{@artifacts_path}/runtime-review.md

Confirm:

- correct server vs client component placement
- no server-only code in client bundles
- route handlers and server actions behave correctly
- no caching or revalidation hazards

---

### [ ] Step: Validation Strategy

<!-- agent: validation-strategy-agent -->

Determine the minimum safe validation scope for this feature.

Output:
{@artifacts_path}/validation-strategy.md

Include:

- change risk classification
- minimum required validation
- optional additional validation
- validation not required

---

### [ ] Step: Implementation

<!-- agent: implementation-agent -->

Implement the feature within the established constraints.

Output:
{@artifacts_path}/implementation-report.md

Include:

- files changed
- logic added or modified
- tests added or updated
- security coding rules followed (reference SECURITY_CODING_PATTERNS.md entries applied)

---

### [ ] Step: Validation

Run repository validation commands.

Output:
{@artifacts_path}/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm test

---

### [ ] Step: E2E Verification (when required)

<!-- agent: playwright-e2e-agent -->

Run Playwright verification when the feature includes auth flows, routing, or browser-realistic behavior.

Output:
{@artifacts_path}/e2e-report.md

Include:

- scenarios tested
- commands run
- pass/fail per scenario
- evidence summary
