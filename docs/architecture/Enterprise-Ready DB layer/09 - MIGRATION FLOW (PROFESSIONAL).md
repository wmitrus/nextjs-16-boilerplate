## DEV – PGLite

```bash
DB_DRIVER=pglite pnpm drizzle-kit migrate --config=drizzle.dev.ts
```

## PROD – Supabase

```bash
DATABASE_URL=postgres://... pnpm drizzle-kit migrate --config=drizzle.prod.ts
```

> Always run migrations locally before deploying.

Never automatically migrate on Vercel.
