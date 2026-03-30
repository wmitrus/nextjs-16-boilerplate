# Workflow 07 - Change Validation Workflow

Purpose:
Determine the minimum sensible validation scope for a specific feature, fix, or refactor — preventing both under-validation and wasteful over-validation.

This workflow is platform-agnostic and may be used in Copilot, Zencoder, or similar agent environments.

Mode ID:

- `change-validation`

Available agents:

- Validation Strategy Agent

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

Use this workflow to produce a validation plan for a specific change — after specialist reviews are done but before or during implementation.

The workflow must:

- determine the changed file set accurately
- classify the change risk
- identify which validation layers are relevant
- produce a minimum-required validation list, an optional list, and a not-required list
- run the minimum required validation and report results
- not over-validate changes that do not require broad test additions

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- classify the change before prescribing validation
- prefer focused validation over broad test additions
- separate minimum required from optional from not-required
- report validation results per check

Never:

- add broad new test suites without Validation Strategy review
- run the full test suite by default when targeted tests suffice
- mark validation complete without running the minimum required checks
- substitute theoretical validation plans for actual command execution

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- planning validation after completing an implementation
- deciding which validation layers are justified for a specific change
- preventing over-testing of low-risk changes
- preventing under-testing of high-risk changes
- any auth/bootstrap/onboarding change (elevated scrutiny required)

Do not use for:

- repository-wide validation audits (use `repository-baseline-validation` instead)
- changes where validation scope is already clear and agreed upon

==================================================
EXPECTED USER INPUT
==================================================

Minimum expected inputs:

- description of the change or diff
- affected files (or working tree diff)
- any known risk areas or specialist constraints

Helpful optional inputs:

- prior specialist review findings
- known failing tests or CI failures
- specific validation types already run

If inputs are incomplete, inspect the current working tree to determine the changed file set.

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Change Intake

- Determine the changed file set from the current working tree and, when relevant, the branch diff against the default branch.
- If the user provided specific files, modules, or risk notes, treat them as priority context but still verify the actual changed files.
- Inspect which tests, configs, workflows, and validation tooling are affected by the change.
- For auth/bootstrap/onboarding changes, read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`, `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`, and `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`.

Output required from this step:

- changed files list
- affected test and validation surfaces identified

Step 2. Validation Risk Assessment

- Validation Strategy Agent classifies the change risk.
- Classification dimensions:
  - does the change affect auth, trust boundaries, or tenancy? (elevated risk)
  - does the change affect module boundaries or DI/composition? (architecture risk)
  - does the change affect server/client placement, routing, or caching? (runtime risk)
  - does the change have existing test coverage? (coverage gap risk)
- State the risk classification explicitly before prescribing validation.

Output required from this step:

- change risk classification
- risk dimensions identified

Step 3. Scope Definition

Produce three explicit lists:

**Minimum required validation** — must pass before the change is considered safe:

- specific test commands to run
- specific scenarios to verify
- typecheck and lint if applicable

**Optional additional validation** — recommended but not blocking:

- broader tests that increase confidence
- integration or E2E tests when justified by the risk level

**Validation not required** — explicitly excluded to prevent over-validation:

- test layers that do not touch the changed surface
- checks already confirmed safe in the current session

Output required from this step:

- three-part validation scope

Step 4. Validation Execution

- Run the minimum required validation commands.
- Capture output per command: exit code, relevant log lines, pass/fail/blocked status.
- If a command fails, state the failure explicitly and do not mark validation complete.

Output required from this step:

- commands run with exit codes
- per-command pass/fail/blocked status

Step 5. Result Report

- State the overall validation status: Pass / Fail / Blocked.
- List any failing or blocked checks with details.
- List any validation gaps that remain open.
- State the recommended next action.

Output required from this step:

- overall validation status
- failing/blocked checks with details
- gaps and recommended next action

==================================================
DECISION / BRANCHING RULES
==================================================

Stop before validation execution if:

- the validation scope depends on unresolved architecture, security, or runtime decisions

Escalate to `05 - Validation Strategy` agent for a full consultation if:

- the proposed scope would materially expand the test suite
- the risk classification is unclear or contested
- auth/bootstrap/onboarding changes require AUTH_FLOW_VERIFICATION_MATRIX review

==================================================
OUTPUTS PRODUCED BY THE WORKFLOW
==================================================

The workflow must produce:

1. Objective
2. Mode
3. Changed Files Considered
4. Current-State Findings
5. Validation-Risk Assessment
6. Recommended Validation Scope (minimum / optional / not-required)
7. Validation Commands or Checks
8. Result per Check
9. Recommended Next Action

==================================================
FAILURE / BLOCK CONDITIONS
==================================================

The workflow must explicitly stop and report a block when:

- the validation scope depends on unresolved specialist decisions
- minimum required validation fails and the failure reason is unclear
- the change scope is too ambiguous to classify risk accurately

==================================================
EXECUTION STYLE
==================================================

Be:

- precise about the three validation tiers
- direct about failure reasons
- conservative about expanding test scope

Do not:

- add tests speculatively without a risk justification
- run the full test suite when targeted tests suffice
- hand-wave failures with "tests mostly pass"

==================================================
SUCCESS CRITERIA
==================================================

A successful run of this workflow:

- produces a clear three-tier validation scope
- runs all minimum required validation and reports results
- calls out any failing checks with detail
- keeps test additions proportional to the actual risk
