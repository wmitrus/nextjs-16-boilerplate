# Bootstrap PGlite vs Local Dev Postgres — Divergence Analysis

**Session**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Generated**: 2026-03-16  
**Status**: Investigation Complete

---

## 1. Objective

Identify the exact divergence between PGlite and local dev Postgres in the `/auth/bootstrap` flow. Determine where the first failure occurs, why it manifests as `TypeError: Failed to fetch`, and what the minimum safe fix target is.

---

## 2. Symptom Summary

| Property                       | Detail                                             |
| ------------------------------ | -------------------------------------------------- |
| Route                          | `/auth/bootstrap`                                  |
| Symptom                        | Page hangs on "Rendering..." then fails            |
| Client error                   | `TypeError: Failed to fetch` (Sentry, client-side) |
| Sentry transaction             | `/auth/bootstrap`                                  |
| Behavior on PGlite             | Works correctly                                    |
| Behavior on local dev Postgres | Fails with above symptom                           |

The "hangs on Rendering..." indicates the server is actively processing the request for an extended duration before failing — consistent with a database connection timeout (postgres-js defaults to ~30s) or a slow query failure, not an immediate rejection.

---

## 3. Confirmed Evidence

### 3.1 Error handling gap in `src/app/auth/bootstrap/page.tsx`

**Confirmed**. The catch block around `provisioningService.ensureProvisioned()` explicitly handles PGlite-specific errors:

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

throw err;  // ← ALL Postgres errors fall here
```

Postgres-specific errors — connection refusal (`ECONNREFUSED`), auth failure, SQL relation errors (`42P01`), or timeouts — do **not** match any of these guards. They fall through to `throw err`.

### 3.2 `createPostgres` has no connection timeout or error wrapping

**Confirmed**. `src/core/db/drivers/create-postgres.ts`:

```typescript
export function createPostgres(url: string): DbRuntime {
  const client = postgres(url); // No connect_timeout, no idle_timeout, no max
  const db = drizzle(client);
  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}
```

The `postgres` npm package defaults to `connect_timeout: 30` seconds. If the dev Postgres container is not running, the first query will **hang for up to 30 seconds** before throwing — which matches the "hangs on Rendering..." symptom.

### 3.3 Migrations are NOT auto-run in the request path

**Confirmed**. `runMigrations` is called from exactly two places:

- `src/core/db/migrate-cli.ts` — manual CLI
- `tests/db/setup.postgres.ts` — test setup (Testcontainers)

`src/core/runtime/bootstrap.ts` and `src/core/runtime/infrastructure.ts` do **not** call `runMigrations`. The runtime assumes the schema already exists.

On PGlite, if `pnpm db:migrate:dev` has previously been run, the schema persists in `./data/pglite/`. On local dev Postgres, `pnpm db:dev:migrate` must be run after `pnpm db:dev:up`, and this is a separate, opt-in manual step.

### 3.4 Unhandled server component throw → RSC stream abort → "Failed to fetch"

**Confirmed mechanism**. `/auth/bootstrap` is an async Next.js Server Component. When it `throw`s an unhandled error:

1. Next.js RSC streaming has already started the HTTP response
2. The stream is aborted mid-way
3. The browser's RSC fetch request receives an incomplete/broken response
4. Browser reports: `TypeError: Failed to fetch`
5. Sentry captures this client-side as a fetch failure on the `/auth/bootstrap` transaction

This is why the error surfaces as a client-side fetch error rather than a server 500 page — the stream was open when the crash happened.

### 3.5 Driver selection logic is correct

**Confirmed**. In `src/core/runtime/bootstrap.ts`, `resolveDbDriver()` returns `'postgres'` when `DB_DRIVER=postgres` is explicitly set, and `'pglite'` as the default in development. The selection is env-driven, correct, and the failure only manifests when explicitly using the postgres path.

### 3.6 The provisioning catch in bootstrap does NOT cover the userRepository call

**Confirmed**. The bootstrap page has a **separate** try/catch for `userRepository.findById()`:

```typescript
try {
  user = await userRepository.findById(internalUserId);
} catch (err) {
  // ... logging
  return <BootstrapErrorUI error="db_error" />;
}
```

This one is handled correctly. **The unhandled path is specifically the provisioning catch block**, which re-throws unknown errors including all Postgres-category errors.

---

## 4. Execution Path

```
Browser → GET /auth/bootstrap
  → Next.js RSC streaming begins (HTTP response starts)
  → [server] BootstrapPage() async starts
  → getAppContainer() → createRequestContainer(buildConfig())
      → resolveDbDriver() → 'postgres' (from DB_DRIVER env)
      → getInfrastructure() → createDb({ driver: 'postgres', url: DATABASE_URL })
          → createPostgres(url) → postgres(url) [lazy, no connection yet]
  → identitySource.get() → Clerk auth → OK
  → buildProvisioningInput() → OK
  → provisioningService.ensureProvisioned(input)
      → runInTransaction(async (db) => { ... })
          → db.transaction() ← FIRST REAL DB CALL
              → postgres-js connects to 127.0.0.1:5432
              ┌─ If container not running: hangs ~30s → throws AggregateError/ECONNREFUSED
              ├─ If container running, migrations not applied: throws PostgreSQL 42P01 "relation does not exist"
              └─ If container running, migrations applied, data ok: proceeds
      [ON FAILURE]: throws PostgreSQL/connection Error
  → catch (err) in bootstrap:
      → logs error
      → err is NOT PGliteWasmAbortError, NOT RuntimeError, NOT ENOENT/EPERM/EACCES
      → throw err  ← DIVERGENCE POINT
  → Next.js catches unhandled throw mid-stream
  → RSC stream aborted
  → Browser: TypeError: Failed to fetch
  → Sentry: captures client-side as fetch failure on /auth/bootstrap
```

---

## 5. Source-of-Truth Analysis

| Concern              | Source of Truth                     | Problem                                                             |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| DB driver selection  | `DB_DRIVER` env (via `env.ts`)      | Correct — env-driven                                                |
| Schema existence     | External state (migrations applied) | **Gap**: no runtime guard to detect missing schema                  |
| Connection liveness  | External state (container running)  | **Gap**: no connection pre-check or timeout override                |
| Error classification | `bootstrap/page.tsx` catch block    | **Gap**: only covers PGlite error types, not Postgres               |
| PGlite schema        | `./data/pglite/` filesystem         | Persists between runs after `db:migrate:dev`                        |
| Postgres schema      | Dev container state                 | Requires explicit `db:dev:up + db:dev:migrate` each time (not auto) |

---

## 6. Likely Failure Points

In priority order:

### 6.1 **[Most Likely]** Local dev Postgres container not started or migrations not run

The developer switches `.env.local` to `DB_DRIVER=postgres` + `DATABASE_URL=postgres://...@127.0.0.1:5432/app_dev` but:

- Did not run `pnpm db:dev:up` → container not running → connection timeout (30s hang)
- Did run `pnpm db:dev:up` but forgot `pnpm db:dev:migrate` → schema missing → SQL error on first query

**Manifests as**: hang on "Rendering..." (connection timeout) or fast fail with SQL error.

### 6.2 **[Confirmed Gap]** Bootstrap catch block does not handle Postgres error types

Regardless of the specific Postgres error, it will **always** bypass the `<BootstrapErrorUI>` return path and hit `throw err`, because the error type guards only cover PGlite-specific conditions.

This is the **code-level divergence** that makes the failure visible as "Failed to fetch" rather than a graceful error UI.

### 6.3 **[Secondary]** `createPostgres` has no connection timeout configuration

No `connect_timeout` is set. The 30-second default from `postgres-js` directly causes the "hangs on Rendering..." experience.

### 6.4 **[Lower probability]** Wrong DATABASE_URL pointing to test DB (port 5433 instead of 5432)

If the developer accidentally sets `DATABASE_URL` to the test database URL (port 5433 `app_test`) while intending to use the dev database, and the test container is not running, the same hang+fail pattern occurs.

---

## 7. Hypotheses

### H1 — Missing migration on dev Postgres container **(Likely)**

The dev Postgres container is running (`pnpm db:dev:up` was executed) but `pnpm db:dev:migrate` was not run. The `auth_user_identities` table does not exist. The first query inside `runInTransaction` throws PostgreSQL error 42P01. The error is re-thrown in bootstrap, aborting the RSC stream.

**Evidence for**: Matches "hangs briefly then fails" (SQL error is fast). Migration step is a separate manual command not linked to container start.

**Evidence against**: If migrations weren't run, the error would be fast (not "hangs on Rendering..."), unless connection itself also has issues.

### H2 — Postgres container not running **(Likely)**

`DB_DRIVER=postgres` is set but `pnpm db:dev:up` was not run (or container was stopped). The `postgres-js` client attempts to connect and waits up to 30s (default `connect_timeout`). This matches the "hangs on Rendering..." symptom exactly.

**Evidence for**: The "hangs on Rendering..." description fits a 30-second connection timeout perfectly. `createPostgres` has no timeout override.

**Evidence against**: If `ECONNREFUSED` were thrown immediately (nothing listening), it would be fast, not "hangs". This may depend on the OS TCP stack behavior.

### H3 — Both issues compound (connection timeout + unhandled error) **(Likely)**

Container is not running → postgres-js waits 30s → throws → error is not caught gracefully in bootstrap → RSC stream aborted → "Failed to fetch". This is the compound case: H2 triggers the hang, H1/the code gap transforms it from a graceful error to a fatal stream abort.

### H4 — Schema drift between PGlite and Postgres migrations **(Unlikely)**

The same migration files in `src/core/db/migrations/generated/` are used for both drivers. Both `drizzle.dev.ts` (PGlite) and `drizzle.dev.postgres.ts` use `out: './src/core/db/migrations/generated'`. No schema divergence exists in the migration files themselves.

---

## 8. Missing Evidence / Uncertainty

| Missing                                                         | Impact                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| Server-side error logs from the failing request                 | Would confirm exact error: ECONNREFUSED vs 42P01 vs other |
| Current state of dev Postgres container                         | Is it running? Are migrations applied?                    |
| Current `.env.local` content (DB_DRIVER, DATABASE_URL values)   | Confirms which scenario applies                           |
| Sentry server-side event for the same `/auth/bootstrap` request | Would show the actual error thrown server-side            |
| Whether the error happens consistently or intermittently        | Helps distinguish timing/race vs structural issue         |

**Fastest evidence reduction**: Check server-side Next.js terminal logs during the failure. The provisioning service logs the error before re-throwing:

```typescript
logger.error({ event: 'provisioning:ensure:failure', errorMessage: ..., errorName: ..., stage: ... }, 'Provisioning ensure failed');
```

The `errorMessage` and `errorName` fields will immediately identify whether it's a connection error, SQL error, or something else.

---

## 9. Exact Failure Points — Summary

### Exact file and statement of the divergence

**File**: `src/app/auth/bootstrap/page.tsx`  
**Location**: The `catch (err)` block around `provisioningService.ensureProvisioned(provisioningInput)`, the final `throw err` statement.

```typescript
// This block handles PGlite errors. Postgres errors pass through.
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

throw err;  // ← THE DIVERGENCE: Postgres connection/SQL errors land here
```

**Secondary file**: `src/core/db/drivers/create-postgres.ts`  
**Issue**: No `connect_timeout` override causes the 30-second hang.

### Problem classification

| Layer                | Problem                                   | Classification                       |
| -------------------- | ----------------------------------------- | ------------------------------------ |
| `bootstrap/page.tsx` | Postgres errors not caught gracefully     | **Error handling gap**               |
| `create-postgres.ts` | No connection timeout                     | **Config omission**                  |
| Dev workflow         | No automatic migration on container start | **Operational gap** (not a code bug) |

---

## 10. Minimum Safe Fix Target

**Do not implement** — investigation only.

The minimum safe fix targets are:

1. **Primary**: In `src/app/auth/bootstrap/page.tsx`, extend the db-error catch to also detect Postgres connection errors and SQL errors. Return `<BootstrapErrorUI error="db_error" />` instead of re-throwing. The most reliable approach is to catch any `Error` that is not a known domain error (`CrossProviderLinkingNotAllowedError`, `TenantContextRequiredError`, `TenantUserLimitReachedError`) and treat it as a db_error rather than re-throwing — or alternatively, explicitly detect `postgres` npm package error types (e.g., checking `err.constructor.name === 'PostgresError'`).

2. **Secondary**: In `src/core/db/drivers/create-postgres.ts`, configure an explicit `connect_timeout` (e.g., 10 seconds) so the failure is fast rather than a 30-second hang.

3. **Operational (documentation/DX)**: Consider whether `pnpm db:dev:up` should invoke `pnpm db:dev:migrate` automatically, or whether the local-db.md setup guide is sufficient — this is a developer workflow concern, not a runtime fix.

---

## 11. Recommended Next Action

**Recommended specialist**: Implementation Agent  
**Recommended action**: Fix the error handling gap in `src/app/auth/bootstrap/page.tsx` to gracefully handle Postgres-category errors (connection errors, SQL errors) by returning `<BootstrapErrorUI error="db_error" />` instead of re-throwing.

**Prior verification** (before implementation): Check server-side Next.js terminal logs from a failing bootstrap request. The `provisioning:ensure:failure` log event will show `errorName` and `errorMessage`, confirming which specific Postgres error class needs to be detected.
