# 02 - Security & Auth - Summary

## Objective

Assess auth and secret-handling implications of the preview AuthJS 500.

## Current-State Findings

- `NEXTAUTH_SECRET` is server-only and is required to sign/verify AuthJS JWT sessions in production-like environments.
- The prior validation path enforced Clerk keys for Clerk but did not enforce AuthJS secret requirements.
- The patch does not expose secrets to client bundles and does not change authorization behavior.
- No real credential values are recorded in this artifact.

## Trust Boundary Assessment

Identity for AuthJS is established through NextAuth server/session handling. The signing secret must come from trusted server-side environment configuration. Allowing production AuthJS to run without it violates the authentication boundary and should be blocked before deployment.

## Docs Vs Code Drift

AuthJS runtime support exists in code and E2E tests despite older docs calling AuthJS incomplete. That drift is informational for this incident; no docs were changed in the patch.

## Risks

- Without `NEXTAUTH_SECRET`, production AuthJS behavior can fail at runtime and invalidate session trust.
- With an invalid Vercel token, live deployment logs cannot be inspected from this session.
- If preview Neon migrations are not configured in Vercel's build command, AuthJS DB-backed flows may still fail after the secret is fixed.

## Recommended Next Action

Require `NEXTAUTH_SECRET` for `AUTH_PROVIDER=authjs` when `NODE_ENV=production`, keep it server-only, and verify Vercel preview environment/build configuration outside this artifact.
