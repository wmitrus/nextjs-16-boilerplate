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
DATABASE_URL_UNPOOLED=postgres://direct-host/... pnpm db:migrate:prod
```

`pnpm db:migrate:prod` requires `DATABASE_URL_UNPOOLED` explicitly and does **not** fall back to `DATABASE_URL` (Codex P1): `DATABASE_URL_UNPOOLED` is the operator trust boundary for Production DDL, since a pooler/proxy hostname pattern cannot be reliably distinguished from a genuinely direct one.

> Always run migrations locally before deploying.

Never automatically migrate on Vercel.
