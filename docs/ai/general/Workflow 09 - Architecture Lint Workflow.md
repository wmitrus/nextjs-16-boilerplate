# Workflow 09 - Architecture Lint Workflow

Purpose:
Perform a structured, read-only architecture audit of module boundaries, dependency direction, DI/composition discipline, contract integrity, auth provider isolation, and docs/code drift — without implementing fixes.

This workflow is platform-agnostic and may be used in Copilot, Zencoder, or similar agent environments.

Mode ID:

- `architecture-lint`

Available agents:

- Architecture Guard Agent

Before running this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/ARCHITECTURE_LINT_RULES.md`
- `docs/ai/general/README-ARCHITECTURE_LINT.md`

Repository note:

In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

==================================================
WORKFLOW GOAL
==================================================

Use this workflow to produce a structured architecture lint report — before a major refactor, after a larger change, or as a periodic health check.

The workflow must:

- inspect real repository files before concluding
- classify all findings as CRITICAL / MAJOR / MINOR / INFORMATIONAL
- compare documentation claims against live code (docs vs code drift)
- produce a prioritized finding report
- NOT implement any fixes

Implementation of fixes found during this workflow is out of scope. Findings feed other workflows (`safe-refactor-workflow`, `safe-feature-workflow`, `incident-investigation`) for remediation.

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth
- inspect imports, composition points, and runtime boundaries
- verify claims against code before reporting
- classify every finding with a severity level
- distinguish implemented behavior from scaffolding/placeholders

Never:

- implement fixes during a lint run
- redesign architecture during a lint run
- infer correctness from directory names alone
- accept "temporary" shortcuts without labeling them as debt
- conflate UI visibility with authorization

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- reviewing the repo before a major refactor to identify risks
- checking for dependency/boundary drift after a larger change
- performing an architectural PR review
- periodic modular-monolith health checks
- pre-release architecture validation

Do not use for:

- implementing fixes (use `safe-refactor-workflow` or `safe-feature-workflow` for that)
- debugging runtime failures (use `debug-investigation` or `incident-investigation`)
- security-specific audits (use `security-incident-workflow` or `security-review` mode)

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- lint scope: full repository, specific modules, or changed files
- any known concerns, prior findings, or patterns to emphasize

Helpful optional inputs:

- recent change set or PR diff to focus on
- prior lint report to compare against
- specific forbidden patterns to check (e.g., cross-module imports)

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Lint Intake

- Define the lint scope: full repo, specific modules, or post-change boundary check.
- Collect any known concerns or prior findings to prioritize.
- Read `docs/ai/general/ARCHITECTURE_LINT_RULES.md` and `docs/ai/general/README-ARCHITECTURE_LINT.md` for the project-specific lint rules.
- State the inspection plan: which layers and modules will be checked.

Output required from this step:

- lint scope definition
- inspection plan
- known concerns to prioritize

Step 2. Structure Inspection

- Architecture Guard Agent inspects the repository structure.
- Check for:
  - module boundary violations (cross-module imports bypassing contracts)
  - dependency direction violations (modules importing from layers above them)
  - business logic leaking into shared/, app/, or presentation layers
  - database access from the delivery layer
  - hidden service locator patterns
  - direct module-to-module imports bypassing public contracts
- Inspect `src/app/`, `src/core/`, `src/features/`, `src/modules/`, `src/security/`, `src/shared/` for boundary compliance.

Output required from this step:

- structure findings per layer
- module boundary violations found

Step 3. Contract and Provider Audit

- Inspect:
  - core contracts: are they stable? Do they have reverse dependencies?
  - DI/composition: is the composition root discipline maintained?
  - auth provider isolation: is provider SDK usage limited to adapters?
  - provider concepts leaking into contracts or authorization domain?
  - security placement: is authorization enforced server-side?
  - role checks scattered across application layers?
  - feature flags embedded directly inside UI components?
- Inspect `src/core/`, `src/modules/auth/`, `src/modules/authorization/`, `src/security/`.

Output required from this step:

- contract integrity findings
- DI/composition findings
- auth provider isolation findings
- security placement findings

Step 4. Findings Classification

- Classify all findings from Steps 2 and 3:

**CRITICAL**:

- breaks modular-monolith boundary rules
- introduces reverse dependency to core
- bypasses authorization enforcement
- introduces cross-tenant or security risks
- creates architectural coupling blocking future extensibility

**MAJOR**:

- weakens DI discipline
- introduces cross-module knowledge leakage
- inconsistent runtime placement
- patterns likely to cause architectural drift

**MINOR**:

- small design inconsistencies
- non-blocking architectural smells

**INFORMATIONAL**:

- observations not representing problems

Output required from this step:

- classified finding list grouped by severity

Step 5. Docs vs Code Drift Check

- Compare documentation claims against live code.
- Check:
  - `docs/ai/general/REPOSITORY_AI_CONTEXT.md` claims vs actual structure
  - Architecture docs or ADRs vs actual module organization
  - Any explicit design docs that may be stale
- Classify each drift as:
  - Minor wording drift (docs ahead of code or slightly inaccurate)
  - Stale file references (docs reference files that moved or were renamed)
  - Architectural drift (docs claim a design that the code does not implement)

Output required from this step:

- docs vs code drift list
- drift severity per item

Step 6. Output Report

- Consolidate all findings into a single architecture lint report.
- Include:
  - objective
  - lint scope
  - confirmed violations (by severity)
  - suspicious patterns (not confirmed violations but worth monitoring)
  - acceptable exceptions (patterns that look like violations but are intentional)
  - docs vs code drift
  - recommended next action (highest-priority finding to address first)

==================================================
DECISION / BRANCHING RULES
==================================================

Always run Steps 1–6 in sequence.

Expand scope to neighboring modules if a violation in one module suggests a systemic pattern.

Do not route to Implementation Agent from this workflow. Report findings and recommend the appropriate follow-up workflow instead.

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Objective
2. Lint Scope
3. Confirmed Violations (grouped by CRITICAL / MAJOR / MINOR / INFORMATIONAL)
4. Suspicious Patterns
5. Acceptable Exceptions
6. Docs vs Code Drift
7. Recommended Next Action

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- required lint rule files (`ARCHITECTURE_LINT_RULES.md`) are not accessible
- the lint scope is too ambiguous to inspect meaningfully
- repository code is not accessible for inspection

==================================================
EXECUTION STYLE
==================================================

Be:

- systematic and thorough
- severity-explicit
- read-only — never implement
- direct about violations

Do not:

- implement fixes during the lint run
- speculate about violations without inspecting real files
- report directory names as proof of correct behavior

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- inspects real repository files before concluding
- classifies all findings with severity
- distinguishes violations from suspicious patterns from acceptable exceptions
- identifies docs vs code drift
- produces a prioritized recommended next action
- does not implement any fixes
