# Repository Baseline Validation Workflow

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `validation-strategy-agent`
  - `architecture-guard-agent`

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

### [ ] Step: Baseline Intake

Collect the audit scope and inventory the repository's test and CI infrastructure.

Output:
{@artifacts_path}/baseline-intake.md

Include:

- audit scope: full repo or targeted modules
- test configuration files found: `vitest.unit.config.ts`, `vitest.integration.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- CI workflows in `.github/workflows/` relevant to validation
- test commands from `package.json` scripts
- coverage configuration and thresholds
- known concerns or areas to prioritize

---

### [ ] Step: Validation Posture Audit

<!-- agent: validation-strategy-agent -->

Run **Validation Strategy Agent** to review the full validation stack.

Output:
{@artifacts_path}/validation-posture.md

Include tier-by-tier assessment:

- unit test layer: coverage, co-location, scope, gaps
- integration test layer: presence, scope, infrastructure quality
- E2E layer: Playwright config, browser scope, coverage
- CI checks: typecheck, lint, test, E2E triggers, coverage enforcement
- over-mocking risks: core behaviors mocked away rather than tested
- critical scenario coverage: auth, authorization, tenancy, security-sensitive flows

---

### [ ] Step: Architecture Boundary Audit

<!-- agent: architecture-guard-agent -->

Run **Architecture Guard Agent** in read-only lint mode to identify areas lacking validation coverage.

Output:
{@artifacts_path}/architecture-audit.md

Focus on:

- module boundaries with no integration tests
- DI/composition points with no test coverage
- auth enforcement points with no dedicated tests
- security-critical paths not covered by any test layer
- correlation between boundary risk and test coverage

---

### [ ] Step: Risk and Gap Assessment

Combine findings from Validation Posture Audit and Architecture Boundary Audit.

Output:
{@artifacts_path}/risk-assessment.md

Include prioritized gap list:

- **CRITICAL**: auth, authorization, trust-boundary, security-enforcement gaps
- **MAJOR**: module boundary gaps, DI/composition not tested, CI check gaps
- **MINOR**: coverage blind spots, style inconsistencies, non-critical scenario gaps

Include risk justification per gap.

---

### [ ] Step: Recommendations

Produce actionable recommendations per gap tier.

Output:
{@artifacts_path}/recommendations.md

Include:

- CRITICAL gaps: specific test, check, or enforcement addition recommendation
- MAJOR gaps: appropriate validation layer and scope recommendation
- MINOR gaps: lower-priority improvement notes
- estimated blast radius per recommendation
- recommended next action (highest-priority item)

---

### [ ] Step: Output Report

Consolidate all findings into a baseline validation report.

Output:
{@artifacts_path}/baseline-report.md

Include:

- validation posture summary
- architecture boundary gap summary
- prioritized gap list (CRITICAL / MAJOR / MINOR)
- recommendations
- recommended next action
