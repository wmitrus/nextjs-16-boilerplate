---
applyTo: '**'
description: 'Use during implementation work to keep validation focused and require Validation Strategy review before broad test additions.'
---

During implementation work, prefer focused validation over broad test expansion.

For substantial multi-step or phase-based implementation work:

- use focused validation while the phase is in progress
- before marking a major phase complete, run `pnpm lint --fix` and `pnpm typecheck`
- do not pay the full repo-wide lint/typecheck cost after every tiny interim edit unless the task explicitly requires it
- if repo-wide lint/typecheck is blocked by unrelated pre-existing issues, record that explicitly in the task artifacts before closing the phase

For any change touching Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or `/users` access control:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

Do not mark the task complete until the affected auth-flow scenarios are explicitly checked or clearly marked as deferred/blocked.

If you are about to add broad new tests, widen an existing suite substantially, or recommend multiple new validation layers beyond the smallest obvious change-level checks, request a `05 - Validation Strategy` review first.

Treat `05 - Validation Strategy` as the authority for:

- whether broader validation is justified
- which validation level is appropriate
- whether proposed tests reduce real risk or only add cost
- whether the change needs unit, integration, e2e, contract-style, or CI-level validation

Do not add wide test surface area by default just because behavior changed.

When a focused implementation patch only needs obvious local validation, proceed directly and report what was run.

When validation scope is unclear or seems likely to expand materially, delegate before adding tests.
