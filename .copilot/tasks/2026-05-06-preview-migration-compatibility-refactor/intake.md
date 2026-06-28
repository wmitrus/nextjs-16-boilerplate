# Intake

## Request

Create a separate traceable task for evaluating and potentially implementing a refactor that keeps the safer direct-URL migration protections but restores compatibility with the long-standing Vercel Preview Build Command, without changing Vercel dashboard settings or build commands.

## Starting Evidence

- Vercel Preview historically used `DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build` and worked.
- Preview now fails inside `drizzle.prod.ts` with `[drizzle.prod] Invalid pooled/unpooled migration configuration`.
- The migration validation logic was tightened on 2026-05-05/06.
- The first breaking commit for the old Preview command was `3b056e83`.

## Key Design Questions

- Can the repository keep the direct-URL DDL safety guarantees without requiring any Vercel dashboard changes?
- Should execution-time migration validation check only the effective migration sink URL instead of enforcing a broader runtime env relationship?
- What is the smallest safe compatibility refactor that preserves PgBouncer / journal-desync protections?
- What validation is required before changing docs or declaring the legacy Preview command supported again?

## Readiness Checklist

- [x] Current failing code path identified
- [x] Historical working Preview command identified
- [x] Breaking commit identified
- [x] Architectural recommendation recorded
- [x] Refactor design finalized
- [x] Implementation completed
- [x] Validation completed
- [x] Docs-update decision finalized
