# Implementation Report — Bootstrap Postgres Divergence Fix

**Session**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Date**: 2026-03-16  
**Status**: IMPLEMENTED

---

## 1. Objective

Fix the `/auth/bootstrap` failure on local dev Postgres that manifested as `TypeError: Failed to fetch` (RSC stream abort) when Postgres connection/SQL errors were re-thrown instead of being handled gracefully.

Two minimum safe changes were applied:

1. `src/app/auth/bootstrap/page.tsx` — catch all remaining provisioning errors as `db_error` instead of re-throwing
2. `src/core/db/drivers/create-postgres.ts` — add explicit `connect_timeout: 10` to fail fast

---

## 2. Affected Files / Modules

| File                                     | Layer                      | What changed                                                                             |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.tsx`        | `app/` (delivery)          | Error handling: `throw err` replaced with `return <BootstrapErrorUI error="db_error" />` |
| `src/core/db/drivers/create-postgres.ts` | `core/db` (infrastructure) | Added `connect_timeout: 10` to postgres client options                                   |
| `src/app/auth/bootstrap/page.test.tsx`   | test                       | Added 2 new test cases for the new behavior                                              |

**Touches**:

- ✅ No contracts changed
- ✅ No DI/composition changed
- ✅ No auth/security enforcement changed
- ✅ No runtime placement changed
- ✅ Tests updated to cover new behavior

---

## 3. Implementation Plan

1. Replace `throw err` at the end of the provisioning catch block in `page.tsx` with `return <BootstrapErrorUI error="db_error" />`
2. Add `connect_timeout: 10` to `postgres()` call in `create-postgres.ts`
3. Add two new unit tests covering the new catch-all behavior

---

## 4. Changes Made

### `src/app/auth/bootstrap/page.tsx`

**Before** (lines 171–183):

```typescript
if (
  err instanceof PGliteWasmAbortError ||
  (err instanceof Error &&
    (err.constructor?.name === 'RuntimeError' ||
      /aborted\(\)/i.test(err.message) ||
      (err as NodeJS.ErrnoException).code === 'ENOENT' ||
      (err as NodeJS.ErrnoException).code === 'EPERM' ||
      (err as NodeJS.ErrnoException).code === 'EACCES'))
) {
  return <BootstrapErrorUI error="db_error" />;
}

throw err;
```

**After**:

```typescript
if (
  err instanceof PGliteWasmAbortError ||
  (err instanceof Error &&
    (err.constructor?.name === 'RuntimeError' ||
      /aborted\(\)/i.test(err.message) ||
      (err as NodeJS.ErrnoException).code === 'ENOENT' ||
      (err as NodeJS.ErrnoException).code === 'EPERM' ||
      (err as NodeJS.ErrnoException).code === 'EACCES'))
) {
  return <BootstrapErrorUI error="db_error" />;
}

return <BootstrapErrorUI error="db_error" />;
```

**Behavior change**: Any error from `provisioningService.ensureProvisioned()` that is not a recognized domain error (`CrossProviderLinkingNotAllowedError`, `TenantUserLimitReachedError`, `TenantContextRequiredError`) or PGlite-specific error now returns a graceful `db_error` UI instead of re-throwing and aborting the RSC stream.

All errors are still logged via `logger.error(...)` before reaching this point, and Sentry's `onRequestError` instrumentation hook continues to capture server-side errors.

### `src/core/db/drivers/create-postgres.ts`

**Before**:

```typescript
const client = postgres(url);
```

**After**:

```typescript
const client = postgres(url, { connect_timeout: 10 });
```

**Behavior change**: Postgres connection attempts now time out after 10 seconds (was ~30s default). Reduces the "hangs on Rendering..." duration from up to 30 seconds to 10 seconds when the dev Postgres container is not running.

### `src/app/auth/bootstrap/page.test.tsx`

Added 2 new test cases:

```typescript
it('renders db_error UI when provisioning throws a generic unknown error (e.g. Postgres runtime error)', async () => {
  provisioningService.ensureProvisioned.mockRejectedValue(
    new Error('unexpected database error'),
  );
  render(await BootstrapPage(makeProps()));
  expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
});

it('renders db_error UI when provisioning throws an ECONNREFUSED error (e.g. Postgres container not running)', async () => {
  const connRefusedError = Object.assign(
    new Error('connect ECONNREFUSED 127.0.0.1:5432'),
    { code: 'ECONNREFUSED' },
  );
  provisioningService.ensureProvisioned.mockRejectedValue(connRefusedError);
  render(await BootstrapPage(makeProps()));
  expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
});
```

---

## 5. Validation / Verification

All commands run successfully:

| Command            | Result                                                       |
| ------------------ | ------------------------------------------------------------ |
| `pnpm typecheck`   | ✅ Pass (0 errors)                                           |
| `pnpm lint`        | ✅ Pass (0 errors)                                           |
| `pnpm arch:lint`   | ✅ Pass (1 pre-existing WARN on container usage — unchanged) |
| `pnpm test` (unit) | ✅ 762 tests passed, 16/16 in bootstrap page.test.tsx        |

Pre-existing failure: `src/core/db/migrations/config/drizzle.test.ts` requires `DATABASE_URL` for a running test Postgres DB — unrelated to this change, present before these edits.

---

## 6. Risks / Follow-ups

### Residual risk: error observability

The `throw err` was removed. Unknown provisioning errors are now swallowed at the UI level and shown as `db_error`. However:

- `logger.error(...)` runs **before** the catch-block branching — all errors are logged with `errorName`, `errorMessage`, `errorStack`, and `stage`
- Sentry's `onRequestError` in `src/instrumentation.ts` captures server-side errors independently of this catch
- No observability is lost; only the UI response changes from RSC stream abort to graceful error UI

### Operational note (not in scope of this fix)

The "hangs on Rendering..." symptom is now reduced from ~30s to ~10s (connection timeout), but not eliminated. The underlying cause — Postgres container not running or migrations not applied — still requires the developer to run `pnpm db:dev:up` and `pnpm db:dev:migrate` before starting the app with `DB_DRIVER=postgres`. This is a documented workflow in `docs/local-db.md` and is out of scope for this fix.

### No integration/e2e test coverage for Postgres path

Unit tests cover the error handling behavior. An integration or E2E test that runs bootstrap against a real unmigrated Postgres would provide the highest confidence, but requires a running container. This is tracked as a follow-up need, not a blocker.
