# 03 - Next.js Runtime - Summary

## Objective

Review runtime-sensitive AuthJS and preview deployment surfaces involved in the incident.

## Current-State Findings

- `src/app/auth/signin/page.tsx` correctly calls `await connection()` before `getServerSession(authOptions)`.
- `src/app/api/auth/[...nextauth]/route.ts` correctly calls `await connection()` before invoking `NextAuth(req, ctx, authOptions)`.
- `src/modules/auth/infrastructure/authjs/auth.ts` exports options only and does not perform a banned module-level `NextAuth(options)` initializer.
- `src/proxy.ts` uses the edge-safe `AuthJsEdgeIdentitySource` for `AUTH_PROVIDER=authjs`; it does not import the Node-only AuthJS credentials provider into edge proxy code.
- Preview plain curl reaches Vercel SSO/protection, not the app. Browser evidence from the user is therefore stronger than unauthenticated curl for app behavior.

## Runtime Boundary Assessment

The failing path is production request-time server code, not static prerender. The known `cacheComponents` route segment config ban is not implicated by the inspected files.

## Docs Vs Code Drift

Some getting-started docs still say AuthJS is not runtime-complete. Current code and E2E specs include AuthJS sign-in, signup, session, dashboard, and onboarding paths. Trust current code for this incident.

Neon deployment docs are current and relevant: preview migration authority belongs to Vercel's preview build command, not a GitHub pre-deploy migration step.

## Risks

- Missing production `NEXTAUTH_SECRET` produces runtime-only AuthJS failure.
- Missing preview migrations produce runtime-only DB errors after switching to AuthJS.
- Vercel protection/log-token limits prevented live stack confirmation in this session.

## Recommended Next Action

Keep the code fix focused on production AuthJS env validation. Do not add preview migrations to `.github/workflows/preview-deploy.yml`; configure the Vercel preview build command to run `pnpm db:migrate:prod && pnpm build`.
