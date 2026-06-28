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
DATABASE_URL_UNPOOLED=postgres://direct-host/... DATABASE_URL=postgres://runtime-host/... pnpm db:migrate:prod
```

`pnpm db:migrate:prod` prefers `DATABASE_URL_UNPOOLED` when it is present and falls back to `DATABASE_URL` only when that effective migration sink is already a direct connection.

> Always run migrations locally before deploying.

Never automatically migrate on Vercel.
