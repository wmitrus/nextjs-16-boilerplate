# Workflow 08 - Repository Baseline Validation Workflow

Purpose:
Assess the repository-wide validation strategy and quality-gate sufficiency — identifying blind spots, over-mocking, weak checks, and missing critical validation coverage, then producing actionable recommendations.

This workflow is platform-agnostic and may be used in Copilot, Zencoder, or similar agent environments.

Mode ID:

- `repository-baseline-validation`

Available agents:

- Validation Strategy Agent
- Architecture Guard Agent

Before running this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

Repository note:

In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

==================================================
WORKFLOW GOAL
==================================================

Use this workflow to audit the current repository-wide validation posture — not for a specific change, but for the overall state of CI, test layers, and quality gates.

The workflow must:

- inventory the full validation stack: unit, integration, E2E, contract, CI checks
- identify coverage gaps and over-mocking blind spots
- perform an architecture boundary audit to identify areas that lack validation coverage
- produce prioritized recommendations for validation improvements

This is a read-and-recommend workflow. Implementation of fixes is not part of this workflow.

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth for what is actually tested
- identify real gaps, not theoretical ones
- assess whether existing tests reduce real risk or only add cost
- cross-reference validation gaps with architecture boundaries

Never:

- recommend broad test additions without risk justification
- conflate test count with test quality
- ignore CI/CD pipeline quality gates in the assessment
- implement changes during a baseline validation run

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- auditing whether the current validation stack is production-grade
- evaluating CI/CD quality gates before a major release or refactor
- identifying testing blind spots before a security-sensitive change
- periodic health checks of the validation posture

Do not use for:

- validating a specific change (use `change-validation` instead)
- debugging a failing test (use `debug-investigation` instead)

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- scope: full repository audit or targeted modules
- any known concerns, prior issues, or areas to prioritize

Helpful optional inputs:

- prior validation audit findings to build on
- specific risk areas (auth, tenancy, security, runtime) to prioritize
- CI/CD pipeline constraints or known gaps

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Baseline Intake

- Collect the audit scope: full repo audit vs targeted modules.
- Inventory the repository's test configuration files:
  - `vitest.unit.config.ts`, `vitest.integration.config.ts`, `vitest.config.ts`, `playwright.config.ts`
  - CI workflows in `.github/workflows/`
  - Coverage thresholds and reporting config
- List all known test commands from `package.json` scripts.
- Note any known gaps or concerns from the user.

Output required from this step:

- audit scope
- test infrastructure inventory
- CI quality gate inventory
- known concerns

Step 2. Validation Posture Audit

- Validation Strategy Agent reviews the full validation stack.
- Assess:
  - unit test layer: coverage, co-location, scope
  - integration test layer: presence, scope, infrastructure
  - E2E layer: Playwright config, browser scope, coverage
  - CI checks: typecheck, lint, test, E2E triggers, coverage enforcement
  - over-mocking risks: are core behaviors mocked away rather than tested?
  - critical scenario coverage: auth, authorization, tenancy, security-sensitive flows
- Produce a validation posture assessment with tier-by-tier findings.

Output required from this step:

- tier-by-tier validation posture
- gaps and blind spots identified
- over-mocking risks identified
- critical scenario coverage assessment

Step 3. Architecture Boundary Audit

- Architecture Guard Agent performs a read-only boundary lint pass.
- Focus on areas that are architecturally significant but potentially under-validated:
  - module boundaries that have no integration tests
  - DI/composition points with no test coverage
  - auth enforcement points with no dedicated tests
  - security-critical paths not covered by any test layer
- Identify whether validation gaps correspond to architectural risk areas.

Output required from this step:

- architecture areas with validation gaps
- highest-risk boundary and enforcement gaps
- correlation between boundary risk and test coverage

Step 4. Risk and Gap Assessment

- Combine findings from Steps 2 and 3.
- Prioritize gaps by risk level:
  - CRITICAL: auth, authorization, trust-boundary, security-enforcement gaps
  - MAJOR: module boundary gaps, DI/composition not tested, CI check gaps
  - MINOR: coverage blind spots, style inconsistencies, non-critical scenario gaps
- Produce a prioritized gap list.

Output required from this step:

- prioritized gap list (CRITICAL / MAJOR / MINOR)
- risk justification per gap

Step 5. Recommendations

- Produce actionable recommendations per gap tier.
- For each CRITICAL gap: recommend specific test, check, or enforcement addition.
- For each MAJOR gap: recommend the appropriate validation layer and scope.
- For MINOR gaps: note as lower-priority improvements.
- Include estimated blast radius for each recommendation.

Output required from this step:

- actionable recommendations per gap
- recommended next action (highest-priority item)

Step 6. Output Report

- Consolidate all findings into a single baseline validation report.
- Include:
  - validation posture summary
  - architecture boundary gap summary
  - prioritized gap list
  - recommendations
  - next action

==================================================
DECISION / BRANCHING RULES
==================================================

Always run both Validation Strategy Agent and Architecture Guard Agent for a full baseline audit.

If the audit scope is a targeted module, restrict both agents to that module but apply the same assessment structure.

Stop before recommendations if:

- the audit scope is too ambiguous to assess meaningfully
- key validation infrastructure files are not accessible

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Objective
2. Audit Scope
3. Validation Infrastructure Inventory
4. Validation Posture Assessment (tier-by-tier)
5. Architecture Boundary Gap Assessment
6. Prioritized Gap List (CRITICAL / MAJOR / MINOR)
7. Recommendations per Gap
8. Recommended Next Action

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- the audit scope is too ambiguous to make meaningful recommendations
- key validation infrastructure files (e.g., Vitest config, Playwright config) are not accessible
- the repository has no test infrastructure at all (report as CRITICAL gap rather than blocking)

==================================================
EXECUTION STYLE
==================================================

Be:

- systematic
- risk-proportionate
- direct about gaps
- actionable in recommendations

Do not:

- implement validation fixes during the audit
- recommend broad test additions without risk justification
- produce vague "add more tests" recommendations without specifying which layer and why

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- inventories the full validation stack accurately
- identifies real gaps with risk justification
- correlates boundary risks with validation gaps
- produces prioritized, actionable recommendations
- does not implement any fixes itself
