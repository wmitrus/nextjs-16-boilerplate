# Validation Report

## Scope

Targeted follow-up consistency check for the deploy-time migration wrapper documentation after the `db:migrate:prod` refactor and 0010/0011 reconciliation work.

## Checks Run

### 1. Wrapper-to-doc consistency review

- Verified `scripts/db-migrate-prod.ts` resolves the effective migration URL as `DATABASE_URL_UNPOOLED || DATABASE_URL`.
- Verified `src/core/db/migrations/config/drizzle.prod.ts` enforces that the effective sink is a direct, unpooled Postgres URL.
- Updated the remaining stale DB workflow docs that still described `db:migrate:prod` as a plain `DATABASE_URL` consumer.

### 2. Targeted repository search

```shell
rg -n "db:migrate:prod|DATABASE_URL_UNPOOLED|0010_password_reset_tokens|0011_email_verification_tokens" docs src scripts .github
```

Result: PASS

Observed outcome:

- Deployment docs already matched the wrapper behavior.
- Residual drift remained only in the generic DB workflow docs and was aligned.

## Validation Verdict

- `db:migrate:prod` documentation is now aligned across deployment and generic DB workflow surfaces.
- No additional code-path validation was required because the underlying wrapper and focused migration checks were already completed in the earlier implementation run.

## Earlier Implementation Validation

- Task ID: investigate-ci-migrations
- Date: 2026-04-27
- Scope: deploy-time migration reconciliation wrapper for `db:migrate:prod`

### Commands Executed

- `pnpm exec vitest run --config vitest.unit.config.ts --coverage.enabled=false scripts/reconcile-known-migration-state.test.ts`
- `node --env-file=.env.production --import tsx scripts/db-migrate-prod.ts --check`
- `pnpm lint --fix`
- `pnpm typecheck`

### Results

- Focused reconciliation planner test: passed (4 tests)
- Production check-only wrapper run: passed; reported `journalTablePresent: true`, `backfilled: []`, `skipped: []`
- Repository lint: passed
- Repository typecheck: passed

### Production State Observed

- `password_reset_tokens` table exists
- `email_verification_tokens` table exists
- Drizzle journal already includes the hashes for `0010_password_reset_tokens` and `0011_email_verification_tokens`
- Production does not show the same `0010` / `0011` desync pattern as preview
- Production is still pending later repo migrations `0012_users_deactivated_at` and `0013_reconcile_snapshot`, but that is normal pending state rather than schema/journal desync

### Remaining Gaps

- No direct local preview DB access was available because Vercel CLI auth is not configured in this shell
- The final proof for preview remains the next preview deployment log

### Residual Risk

- If the preview DB has a partially applied `0010` or `0011` schema instead of the fully matching schema implied by the original error, the wrapper will fail intentionally with a clearer blocking message rather than silently backfilling the journal
