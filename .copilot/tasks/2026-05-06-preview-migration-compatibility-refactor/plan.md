# Preview Migration Compatibility Refactor

## Task ID

`2026-05-06-preview-migration-compatibility-refactor`

## Status

**IMPLEMENTATION + FOCUSED VALIDATION COMPLETE**

## Objective

Preserve the safer migration model that requires a direct database URL for DDL while restoring compatibility with the long-standing Vercel Preview Build Command, without requiring any Vercel dashboard changes or build-command edits.

## Checklist

- [x] Confirm the real regression trigger from code history
- [x] Identify the exact breaking commit and prior working operational model
- [x] Record the architectural verdict on whether compatibility can be restored without dashboard changes
- [x] Create an artifact-backed task for the refactor
- [x] Design the minimal code change that validates only the actual migration sink
- [x] Implement the compatibility refactor
- [x] Run focused migration validation against legacy and preferred env shapes
- [x] Decide whether broader docs should be updated after successful validation

## Reviewed Surfaces

- `src/core/db/migrations/config/drizzle.prod.ts`
- `scripts/db-migrate-prod.ts`
- `.github/workflows/preview-deploy.yml`
- `docs/features/DEPLOY-neon.md`
- `docs/features/34 - Admin Bootstrap.md`

## Outcome Summary

- The current Preview regression is not caused by the bootstrap script or by the latest preview workflow rollback.
- The long-standing Vercel Preview Build Command remained stable; the regression was introduced by stricter migration config validation.
- The first hard incompatible change was commit `3b056e83` (`fix(db): validate pooled/unpooled database URL configuration`).
- The safe refactor direction is to validate the actual migration URL sink rather than hard-failing on the runtime relationship between `DATABASE_URL` and `DATABASE_URL_UNPOOLED` inside the migration execution path.
- The implemented refactor now validates the effective migration URL (`migrationUrl = DATABASE_URL_UNPOOLED || DATABASE_URL`) and preserves hard failure only when that effective sink is pooled.
- Focused validation passed for the legacy shell-override shape, the preferred pooled/direct shape, and the intentionally invalid pooled-sink shape.
- Broader docs changes can now be considered from a validated state instead of a design-only hypothesis.
