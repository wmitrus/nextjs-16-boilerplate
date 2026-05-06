# Admin Bootstrap Deploy Design

## Task ID

`2026-05-05-admin-bootstrap-deploy-design`

## Status

**DESIGN + IMPLEMENTATION PLAN COMPLETE** — bootstrap ownership design is complete, the workflow/env implementation is complete, and PR3 preparation guidance is now recorded for manual staging by the user.

## Objective

Decide whether the current first-admin bootstrap mechanism is production-ready, where bootstrap inputs should live, whether this belongs in seeds, Vercel environment variables, or CI secrets, and produce an implementation-ready production plan.

## Checklist

- [x] Review current bootstrap script and deployment workflows
- [x] Review env ownership and tenancy coupling
- [x] Complete architecture review
- [x] Complete security/auth review
- [x] Complete validation strategy review
- [x] Produce implementation-ready recommendation set
- [x] Record PR3 staging strategy and manual `git add` plan
- [x] Record Vercel preview/production bootstrap verification plan

## Reviewed Surfaces

- `scripts/bootstrap-admin.ts`
- `.github/workflows/preview-deploy.yml`
- `.github/workflows/prod-deploy.yml`
- `src/core/env.ts`
- `.env.example`
- `src/modules/authorization/infrastructure/drizzle/seed.ts`
- `src/security/core/node-provisioning-access.ts`

## Outcome Summary

- Keep the dedicated bootstrap script.
- Do not move first-admin production bootstrap into generic seed flows.
- Remove `DEFAULT_TENANT_ID` from GitHub secret ownership in deploy workflows.
- Treat `DEFAULT_TENANT_ID` as deployment environment config only.
- Prefer Vercel environment variables over GitHub secrets for bootstrap inputs if automatic bootstrap remains in the deploy workflow.
- Best production shape: explicit one-time bootstrap operation after deploy, then remove bootstrap password.
