# Validation Report

## Focused Checks

### Auth follow-up slice

Passed:

- `pnpm exec vitest run -c vitest.unit.config.ts src/app/api/auth/active-org/route.test.ts src/modules/auth/ui/authjs/AuthJsWorkspaceSwitcher.test.tsx src/modules/auth/infrastructure/authjs/auth.test.ts src/app/auth/signin/sign-in-client.test.tsx`

Notes:

- JSDOM emitted `Not implemented: navigation to another Document` during client tests that intentionally exercise `window.location.href`. Tests still passed.

### Waitlist coverage slice

Passed:

- `pnpm exec vitest run -c vitest.unit.config.ts src/modules/waitlist/infrastructure/DefaultWaitlistService.test.ts`
- `pnpm exec vitest run -c vitest.db.local.config.ts src/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository.db.test.ts`

### Invitation and migration follow-up slice

Passed:

- `pnpm exec vitest run -c vitest.unit.config.ts src/modules/invitations/infrastructure/DefaultInvitationService.test.ts src/app/admin/invitations/InvitationsClient.test.tsx src/app/api/admin/invitations/route.test.ts scripts/reconcile-known-migration-state.test.ts`

Notes:

- Duplicate invitation `409` handling is now covered end-to-end at the route + client-message parsing level within focused unit tests.
- The reconciler test now asserts that journal backfills execute inside a `SERIALIZABLE` transaction before the insert runs.

## Residual Notes

- The Node warning about `MODULE_TYPELESS_PACKAGE_JSON` is pre-existing and unrelated to this change.
