## DEV – PGLite

```bash
pnpm db:pglite:migrate
```

## LOCAL – Postgres container

```bash
pnpm db:dev:up
pnpm db:dev:migrate
```

## TEST – Postgres container

```bash
pnpm db:test:up
pnpm db:test:migrate
```

## PROD – Supabase

```bash
DATABASE_URL=postgres://... pnpm db:migrate:prod
```

> Always run migrations locally before deploying.

Never automatically migrate on Vercel.
