---
description: 'Assess the repository-wide validation posture by routing a repo-level validation audit to 05 - Validation Strategy.'
name: 'Repository Baseline Validation'
argument-hint: 'Optional validation concerns, critical flows, or repo areas to emphasize'
agent: '05 - Validation Strategy'
---

Run `05 - Validation Strategy` in `Repository Baseline Validation` mode for this repository.

If the audit touches auth/bootstrap/onboarding behavior:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for auth-flow scenarios under review

Workflow:

- Inspect the repository's validation stack in live code rather than trusting documentation alone.
- Review the current quality gates, test layers, workflows, and validation tooling.
- Identify critical repository flows that are meaningfully validated, under-validated, or over-validated.
- Recommend the minimum governance or validation improvements needed to improve safety without creating validation waste.

At minimum, inspect when relevant:

- `package.json`
- `vitest*.config.*`
- `playwright.config.*`
- `.github/workflows/*`
- `scripts/architecture-lint.sh`
- `src/testing/*`
- representative colocated `*.test.*` files
- `e2e/*`

Required output:

1. Objective
2. Mode
3. Current-State Findings
4. Validation-Risk Assessment
5. Recommended Validation Scope
6. Risks and Tradeoffs
7. Validation Commands or Checks
8. Recommended Next Action

Inside `Recommended Validation Scope`, focus on:

- critical repository-level gaps
- minimum governance improvements
- validation that appears wasteful or misleading

If safe recommendations depend on unresolved architecture, security, or runtime decisions, state the block explicitly.
