# 06 - Debug Investigation - Summary

## Objective

Find the likely root cause of the Vercel preview AuthJS 500 after switching from Clerk to AuthJS.

## Symptom Summary

Preview sign-in fails with NextAuth `CLIENT_FETCH_ERROR`, `/api/auth/_log` returns 500, and the production RSC render path reports an omitted Server Components error.

## Confirmed Evidence

- `src/app/auth/signin/page.tsx` calls `getServerSession(authOptions)` on the server when `AUTH_PROVIDER=authjs`.
- `src/modules/auth/infrastructure/authjs/auth.ts` sets `authOptions.secret` from `env.NEXTAUTH_SECRET`, with a dev fallback only when `NODE_ENV=development`.
- `src/core/env.ts` previously made `NEXTAUTH_SECRET` optional and did not validate it for `AUTH_PROVIDER=authjs`.
- `scripts/validate-env.ts` previously validated Clerk requirements only; preview CI could pass with `AUTH_PROVIDER=authjs`, `NODE_ENV=production`, and no `NEXTAUTH_SECRET`.
- Preview deployment workflow does not run migrations itself.
- `docs/features/DEPLOY-neon.md` says Neon preview migrations should run in Vercel's deployment-scoped preview build command, not in GitHub before `vercel deploy`.
- Local endpoint probing was blocked by Vercel SSO/protection from plain curl.
- Vercel runtime logs later confirmed `GET /auth/signin` and `GET /auth/signup` fail with NextAuth `NO_SECRET` / `MissingSecretError`.
- Vercel build inspection later confirmed the deployment build command already runs `DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build`, and Drizzle migrations completed successfully.

## Execution Path

1. Browser requests `/auth/signin`.
2. `src/proxy.ts` uses `AuthJsEdgeIdentitySource` because `AUTH_PROVIDER=authjs`.
3. Public auth route proceeds to the App Router page.
4. `src/app/auth/signin/page.tsx` awaits `connection()`, confirms AuthJS provider, then calls `getServerSession(authOptions)`.
5. NextAuth uses `authOptions.secret`.
6. If `NEXTAUTH_SECRET` is missing in production, the server auth configuration is invalid.
7. Client NextAuth logging then attempts `/api/auth/_log`, which also returns 500.

## Source-Of-Truth Analysis

AuthJS session signing secret is an environment-owned server secret. The repository should fail preview validation before deployment when the secret is missing in production mode.

Neon schema state is database-owned. For preview branches, Vercel deployment-time Neon injection is the authority; GitHub pre-deploy migration can target the wrong preview DB.

## Likely Failure Points

1. Confirmed: missing or empty `NEXTAUTH_SECRET` in Vercel preview when `AUTH_PROVIDER=authjs`.
2. Ruled down: preview Neon migrations. Build logs show migrations ran successfully against the unpooled URL before `pnpm build`.
3. Secondary non-blocking warnings: Upstash DNS/timeouts, New Relic log-file writes to read-only `/var/task`.

## Missing Evidence / Uncertainty

- Direct preview app probing is blocked by Vercel SSO/protection without a bypass cookie/header.
- Preview Neon branch tables were not directly queried, but deployment build logs show migration execution succeeded.

## Recommended Next Action

Patch env validation to require `NEXTAUTH_SECRET` for `AUTH_PROVIDER=authjs` under `NODE_ENV=production`, keep Neon preview migrations in the Vercel build-command path documented in `docs/features/DEPLOY-neon.md`, then redeploy preview after fixing Vercel env/build settings.
