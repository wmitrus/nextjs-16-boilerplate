# Implementation Plan

## Proposed Direction

Refactor production migration validation so the execution path validates the effective migration sink URL, not the broader runtime relationship between `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

## Intended Change Shape

1. Keep `scripts/db-migrate-prod.ts` responsible for resolving the effective migration URL.
2. Update `src/core/db/migrations/config/drizzle.prod.ts` so it enforces:
   - postgres URL format
   - direct / unpooled URL only
3. Remove or downgrade the cross-field hard failure that requires `DATABASE_URL` to remain pooled during migration execution.
4. Preserve explicit erroring when the actual migration URL is pooled.

## Focused Validation Plan

1. Validate with legacy-compatible env shape:
   - `DATABASE_URL` temporarily overridden to the direct URL
   - direct URL accepted
2. Validate with preferred steady-state env shape:
   - `DATABASE_URL` pooled
   - `DATABASE_URL_UNPOOLED` direct
   - direct URL accepted
3. Validate invalid shape:
   - effective migration URL pooled
   - command fails clearly

## Decision Gate

Only after the focused validation succeeds should broader docs be updated to describe the supported compatibility model.

## Implementation Result

- Implemented in `src/core/db/migrations/config/drizzle.prod.ts`
- The config now resolves `migrationUrl = DATABASE_URL_UNPOOLED || DATABASE_URL`
- Validation now checks only the effective migration sink used by Drizzle:
  - postgres URL format required
  - pooled / PgBouncer URL rejected
- The previous hard-fail cross-check between `DATABASE_URL` and `DATABASE_URL_UNPOOLED` was removed from the execution path

## Focused Validation Result

1. Legacy-compatible env shape: PASS
   - `DATABASE_URL` set directly to the direct URL, `DATABASE_URL_UNPOOLED` unset
   - import of `drizzle.prod.ts` succeeded
2. Preferred steady-state env shape: PASS
   - `DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` direct
   - import of `drizzle.prod.ts` succeeded
3. Invalid pooled sink shape: PASS
   - effective migration URL pointed at `-pooler`
   - config threw the expected pooled/PgBouncer error
