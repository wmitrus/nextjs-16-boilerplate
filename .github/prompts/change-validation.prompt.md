---
description: 'Determine the minimum safe validation scope for the current change by collecting changed files and routing the review to 05 - Validation Strategy.'
name: 'Change Validation'
argument-hint: 'Optional change context, risk notes, or files to emphasize'
agent: '05 - Validation Strategy'
---

Run `05 - Validation Strategy` in `Change Validation` mode for the current repository change.

For any auth/bootstrap/onboarding change:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

Workflow:

- First determine the changed file set from the current working tree and, when relevant, the current branch diff against the default branch.
- If I provided specific files, modules, or risk notes, treat them as priority context but still verify the actual changed files in the repository.
- Inspect the affected tests, configs, workflows, and validation tooling that matter for this change.
- Recommend the minimum sensible validation scope for this change.

Required output:

1. Objective
2. Mode
3. Changed Files Considered
4. Current-State Findings
5. Validation-Risk Assessment
6. Recommended Validation Scope
7. Validation Commands or Checks
8. Recommended Next Action

Inside `Recommended Validation Scope`, separate:

- minimum required validation
- optional additional validation
- validation explicitly not required

If safe validation planning depends on unresolved architecture, security, or runtime decisions, state the block explicitly.
