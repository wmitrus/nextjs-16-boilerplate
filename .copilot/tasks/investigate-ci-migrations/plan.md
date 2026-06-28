# Plan

- Task ID: investigate-ci-migrations
- Objective: Determine CI migration behavior, fix the preview/prod deployment flow, and close follow-up review comments on the resulting code and docs.
- Objective: Repair the preview migration desync around `0010_password_reset_tokens` / `0011_email_verification_tokens` without breaking production, and verify whether production is also desynchronized.
- Status: Completed

## Checklist

- [x] Read required repository and workflow guidance
- [x] Inspect deploy workflows for explicit migration steps
- [x] Inspect package scripts for install/build hooks and migration entrypoints
- [x] Inspect CI workflows that may run migrations indirectly through tests or E2E helpers
- [x] Correlate findings into confirmed execution paths and likely sources of observed CI logs
- [x] Deliver evidence-backed conclusion and recommendation
- [x] Apply follow-up review fixes for docs, workflow hardening, and local tooling
- [x] Reconfirm the current preview root cause from the April 27 failing deploy log
- [x] Check production state for the same `0010` / `0011` desync pattern
- [x] Implement the minimal migration-state reconciliation wrapper for prod/preview deploy migrations
- [x] Add focused validation for reconciliation logic
- [x] Run focused validation plus `pnpm lint --fix` and `pnpm typecheck`
- [x] Update implementation and validation artifacts with the new migration-reconciliation scope
- [x] Close remaining migration-doc drift for `db:migrate:prod` environment resolution
