# Implementation Plan

- Task ID: investigate-ci-migrations
- Scope: make deploy-time `db:migrate:prod` resilient to the known preview schema/journal drift for `0010_password_reset_tokens` and `0011_email_verification_tokens`, while remaining a no-op on healthy databases such as current production.
- Status: Completed

## Phase Checklist

- [x] Confirm root cause from the failing preview deploy log
- [x] Inspect production for the same desync pattern
- [x] Add a preflight reconciliation step before `drizzle-kit migrate`
- [x] Limit reconciliation to known, schema-verified historical drift cases
- [x] Preserve the existing preview/prod deployment model and config surface
- [x] Add focused tests for reconciliation planning logic
- [x] Validate wrapper behavior against local production env in read-only mode
- [x] Finish with `pnpm lint --fix` and `pnpm typecheck`

## Guardrails

- Do not change the Vercel preview/production ownership model.
- Do not run destructive DB operations.
- Do not mark a migration as applied unless the corresponding live schema artifacts already exist.
- Keep the change at the package-script / migration-wrapper boundary; do not redesign runtime DB initialization.
