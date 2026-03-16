# Local Dev Database — Corrective Pass Report

**Date**: 2026-03-16  
**Status**: COMPLETE — no code changes required for the three identified gaps

---

## Objective

Investigate and close the three remaining implementation gaps identified in `db-implementation-report.md`, plus address the `podman-compose.yml` image name issue discovered at runtime.

---

## Gap 1: Seed flow

**Reported concern**: `db:dev:seed` and `db:test:seed` point to a missing seed implementation.

**Finding**: **Already resolved.** `scripts/db-seed.ts` exists with a full implementation:

- Reads `DB_PROVIDER`, `DB_DRIVER`, `DATABASE_URL` from env
- Calls `createDb` with the resolved driver
- Calls `seedUsers`, `seedAuthorization`, `seedBilling` in sequence
- All three seed modules exist:
  - `src/modules/user/infrastructure/drizzle/seed.ts`
  - `src/modules/authorization/infrastructure/drizzle/seed.ts`
  - `src/modules/billing/infrastructure/drizzle/seed.ts`

`db-ops.mjs` correctly invokes it with:

```js
run('pnpm', ['exec', 'tsx', 'scripts/db-seed.ts'], {
  ...process.env,
  DATABASE_URL: url,
  DB_DRIVER: 'postgres',
  DB_PROVIDER: 'drizzle',
});
```

**Action taken**: None required.

---

## Gap 2: postgres-schema-reset.ts runtime dependency

**Reported concern**: Unresolved assumption about whether the `postgres` npm package is available.

**Finding**: **Already resolved.**

- `postgres@3.4.8` is installed (present in `node_modules/.pnpm/`)
- `postgres` is listed as a top-level dependency in `package.json`
- `scripts/lib/postgres-schema-reset.ts` uses `import postgres from 'postgres'` — fully satisfied

**Action taken**: None required.

---

## Gap 3: Deprecated alias documentation

**Reported concern**: `db:local:*` alias policy should be explicit in docs.

**Finding**: **Already resolved.** `docs/local-db.md` contains an explicit "Deprecated aliases" section with a full mapping table:

| Deprecated         | Canonical         |
| ------------------ | ----------------- |
| `db:local:up`      | `db:test:up`      |
| `db:local:down`    | `db:test:down`    |
| `db:migrate:local` | `db:test:migrate` |
| `db:studio:local`  | `db:test:studio`  |

**Action taken**: None required.

---

## Runtime issue resolved by user: podman-compose.yml image name

**Issue**: The investigation agent identified that `postgres:16-alpine` (unqualified short name) fails on Podman without `unqualified-search-registries` configured. During an attempted fix, both `container_name` fields were incorrectly set to `docker.io/library/postgres:16-alpine` instead of the `image` field.

**Resolution**: The user corrected `podman-compose.yml`. Current state is correct:

```yaml
dev-db:
  image: docker.io/library/postgres:16-alpine
  container_name: nextjs16_dev_db
  ...

test-db:
  image: docker.io/library/postgres:16-alpine
  container_name: nextjs16_test_db
  ...
```

`pnpm db:dev:up` now succeeds and `pnpm db:dev:migrate` correctly connects.

---

## Validation Results

| Check                                            | Result                  |
| ------------------------------------------------ | ----------------------- |
| `pnpm typecheck`                                 | ✅ passes               |
| `pnpm lint`                                      | ✅ passes               |
| `db-seed.ts` exists and fully implemented        | ✅ confirmed            |
| All three seed modules exist                     | ✅ confirmed            |
| `postgres@3.4.8` installed                       | ✅ confirmed            |
| `docs/local-db.md` deprecated alias section      | ✅ confirmed            |
| `podman-compose.yml` fully-qualified image names | ✅ confirmed (user fix) |
| `db:dev:up` → container starts                   | ✅ confirmed by user    |
| `db:dev:migrate` → connects to 127.0.0.1:5432    | ✅ confirmed by user    |

---

## Files Changed

None. All three identified gaps were already resolved in the prior implementation. The `podman-compose.yml` fix was applied by the user outside this agent pass.

---

## Remaining Limitations

None that are blocking. The local dev Postgres workflow is operationally complete.
