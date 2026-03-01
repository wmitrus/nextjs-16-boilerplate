## DEV – PGLite

```bash
pnpm db:migrate:dev
```

## PROD – Supabase

```bash
DATABASE_URL=postgres://... pnpm db:migrate:prod
```

> Always run migrations locally before deploying.

Never automatically migrate on Vercel.
