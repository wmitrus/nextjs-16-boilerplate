# DB Migration Ops Checklist (Modular Monolith)

## Objective

Single universal command `pnpm db:migrate` with environment-controlled target:

- non-production (`NODE_ENV!=production`) => local PGlite
- production (`NODE_ENV=production`) => Postgres/Supabase only

This keeps domain isolated from infrastructure and avoids DB driver leakage.

## Current Architecture Rules

- Domain layer does not import DB driver/ORM config.
- Driver decision is made in infrastructure runtime (`src/core/db/client.ts`).
- Migration target/driver decision is made in infrastructure config (`drizzle.config.ts`).
- `db:migrate` remains universal (`drizzle-kit migrate`).

## Runtime Resolution

- File: `src/core/db/client.ts`
- Behavior:
  - `NODE_ENV=production`: requires `DATABASE_URL` and validates postgres URL.
  - otherwise: uses PGlite with path resolved from `DATABASE_URL` or fallback `./data/pglite`.

## Migration Resolution

- File: `drizzle.config.ts`
- Behavior:
  - `NODE_ENV=production`: requires postgres URL; does NOT enable pglite driver.
  - otherwise: uses `driver: 'pglite'` and fallback path `./data/pglite`.

## Operational Flows

### DEV (PGlite)

Option A (recommended local default):

```bash
NODE_ENV=development pnpm db:migrate
```

Option B (explicit path):

```bash
NODE_ENV=development DATABASE_URL=file:./data/pglite pnpm db:migrate
```

### TEST (PGlite)

```bash
NODE_ENV=test DATABASE_URL=file:./data/pglite-test pnpm db:migrate
```

### PROD (Supabase/Postgres)

```bash
NODE_ENV=production DATABASE_URL=postgresql://... pnpm db:migrate
```

## Safety Checklist

- [ ] No `drizzle-orm` imports in domain files.
- [ ] No DB driver imports outside infrastructure/config.
- [ ] `db:migrate` used universally (no separate prod-only command required).
- [ ] `NODE_ENV=production` always paired with postgres URL.
- [ ] Never run `db:generate` in production runtime.
- [ ] Migrations committed in repository.
- [ ] Data directories (`.pglite`, `data/*`) remain gitignored.

## Quick Validation Commands

```bash
pnpm db:migrate
pnpm typecheck
pnpm env:check
```

## Notes

- If migration runs in dev with no `DATABASE_URL`, fallback target is `./data/pglite`.
- In production, invalid or missing `DATABASE_URL` fails fast before migration starts.
