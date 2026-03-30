## DEV – PGLite

```bash
pnpm db:migrate:dev
```

## LOCAL – Postgres container

```bash
pnpm db:local:up
pnpm db:migrate:local
```

## PROD – Supabase

```bash
DATABASE_URL=postgres://... pnpm db:migrate:prod
```

> Always run migrations locally before deploying.

Never automatically migrate on Vercel.
