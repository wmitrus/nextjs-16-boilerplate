# Constraints

## Binding Constraints

- Do not log or write real secrets, tokens, connection strings, or credential-shaped values into artifacts.
- Do not change AuthJS runtime behavior beyond failing fast on invalid production configuration.
- Do not add GitHub pre-deploy preview migrations for Neon preview branching; use the deployment-scoped Vercel build command instead.
- Preserve Next.js 16 `cacheComponents` constraints: no route segment `dynamic` or `runtime` exports.
- Preserve AuthJS route handler pattern: `NextAuth(req, ctx, authOptions)` inside the route handler only.

## Allowed Changes

- Add production AuthJS secret validation to `src/core/env.ts`.
- Wire the existing bootstrap validation call to pass `NEXTAUTH_SECRET` and `NODE_ENV`.
- Update focused env validation tests and CLI validation plumbing.

## Forbidden Changes

- Do not move auth logic into client code.
- Do not expose `NEXTAUTH_SECRET` through any `NEXT_PUBLIC_*` surface.
- Do not refactor the auth provider architecture as part of this incident.
- Do not seed or migrate production/preview DBs from local scripts without explicit operator intent.

## External Follow-Up

- In Vercel Preview env, verify `AUTH_PROVIDER=authjs` and a non-empty `NEXTAUTH_SECRET`.
- For Neon preview branching, set Vercel preview Build Command to:

```bash
pnpm db:migrate:prod && pnpm build
```

- Verify `DATABASE_URL_UNPOOLED` is available to the Vercel preview deployment build environment through the Neon integration.
- Refresh the local/CI Vercel token before attempting deployment log inspection again.
