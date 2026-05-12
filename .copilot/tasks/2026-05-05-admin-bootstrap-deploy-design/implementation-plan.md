# Implementation Plan

## Status

Bootstrap ownership change is implemented. The remaining step is manual PR3 assembly by the user.

## Production-Ready Target Shape

1. Keep `scripts/bootstrap-admin.ts` as a dedicated operational bootstrap mechanism.
2. Do not move first-admin production bootstrap into shared seed routines.
3. Remove `DEFAULT_TENANT_ID` from GitHub secret injection in deploy workflows.
4. Resolve `DEFAULT_TENANT_ID` only from the pulled Vercel environment because it is runtime config, not CI-only secret material.
5. If automatic bootstrap remains in deploy workflows, read `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from Vercel environment variables, not GitHub secrets.
6. Prefer a one-time operator-run bootstrap path for production rather than automatic execution on every production deploy.
7. After successful bootstrap, remove `BOOTSTRAP_ADMIN_PASSWORD` from the environment.
8. Keep preview bootstrap optional and explicitly preview-scoped.
9. Align `.env.example` and workflow behavior so there is one operational model.

## Recommended Rollout Order

### Option A — Lowest Operational Risk

- Production: remove automatic bootstrap from deploy workflow.
- Production: document and run `pnpm bootstrap:admin` as an explicit one-time operator action against production env.
- Preview: keep optional auto-bootstrap only if preview QA genuinely needs admin access.

### Option B — Keep Auto-Bootstrap, Fix Ownership

- Preview and production: keep bootstrap step.
- Move bootstrap credentials to Vercel envs.
- Stop injecting `DEFAULT_TENANT_ID` from GitHub secrets.
- Keep bootstrap step guarded and idempotent.
- Document required post-bootstrap password removal.

## Explicit Non-Goals

- No move into generic seed logic.
- No broad tenancy redesign.
- No weakening of `DEFAULT_TENANT_ID` runtime requirement in single-tenant mode.

## PR3 Recommendation

### Recommended PR3 Boundary

Keep PR3 as the product/runtime/bootstrap slice only:

- admin, invitations, waitlist, signup/reset/verification, and bootstrap code
- related tests and scripts
- bootstrap/deploy contract files
- only the directly coupled bootstrap deployment docs

Keep out of PR3:

- `.copilot/tasks/**`
- broader AI/artifact/governance churn
- unrelated feature docs not required to explain the bootstrap rollout

### Include In PR3

- `.env.example`
- `.github/workflows/preview-deploy.yml`
- `.github/workflows/prod-deploy.yml`
- `scripts/bootstrap-admin.ts`
- `scripts/e2e/run-scenario.mjs`
- `e2e/admin-users.spec.ts`
- `e2e/admin.spec.ts`
- `e2e/authjs-verify-email.spec.ts`
- changed runtime files under `src/app/admin/**`, `src/app/api/admin/**`, `src/app/api/auth/**`, `src/app/auth/**`, `src/app/waitlist/**`
- changed invitation, waitlist, authorization, provisioning, and user files under `src/modules/**`
- changed directly coupled runtime/support files under `src/core/**`, `src/shared/**`, `src/security/**`, `src/testing/**`
- directly coupled docs only:
  - `docs/features/34 - Admin Bootstrap.md`
  - `docs/sdd/deployVercelPreview.yml`
  - `docs/sdd/deployVercelProd.yml`

### Leave Out Of PR3

- `.copilot/tasks/2026-05-05-admin-bootstrap-deploy-design/**`
- `docs/features/07 - Testing Infrastructure.md`
- `docs/features/32 - AuthJS Custom Auth Provider.md`
- `docs/features/33 - Waitlist Email Flow.md`
- `docs/features/35 - Admin User Management.md`

These can go into a later docs-focused PR if you still want the earlier product-vs-doc split.

## Manual Git Add Plan For PR3

Run only these commands when you assemble PR3:

```shell
git add .env.example
git add .github/workflows/preview-deploy.yml .github/workflows/prod-deploy.yml
git add scripts/bootstrap-admin.ts scripts/e2e/run-scenario.mjs
git add e2e/admin-users.spec.ts e2e/admin.spec.ts e2e/authjs-verify-email.spec.ts
git add src/app/admin src/app/api/admin
git add src/app/api/auth/forgot-password src/app/api/auth/invite src/app/api/auth/resend-verification src/app/api/auth/reset-password src/app/api/auth/signup src/app/api/auth/waitlist
git add src/app/auth/forgot-password src/app/auth/registration-closed src/app/auth/reset-password src/app/auth/signup src/app/auth/verify-email src/app/auth/verify-email-pending
git add src/app/waitlist
git add src/app/components/sections/CTA.tsx
git add src/core/contracts/user.ts src/core/db/migrations/config/drizzle.prod.ts src/core/db/migrations/generated/0014_pending_invitation_unique.sql src/core/env.test.ts
git add src/modules/authorization/infrastructure/drizzle/schema.ts src/modules/authorization/infrastructure/drizzle/seed.ts
git add src/modules/invitations/domain/EmailService.ts src/modules/invitations/domain/InvitationRepository.ts
git add src/modules/invitations/infrastructure/DefaultInvitationService.ts src/modules/invitations/infrastructure/DrizzleInvitationRepository.test.ts src/modules/invitations/infrastructure/EmailServiceFactory.test.ts src/modules/invitations/infrastructure/EmailServiceFactory.ts src/modules/invitations/infrastructure/NoOpEmailService.ts
git add src/modules/invitations/infrastructure/clerk/ClerkInvitationBridge.ts src/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository.ts
git add src/modules/invitations/infrastructure/resend/ResendEmailService.test.ts src/modules/invitations/infrastructure/resend/ResendEmailService.ts
git add src/modules/invitations/infrastructure/smtp/NodemailerEmailService.test.ts src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts
git add src/modules/invitations/ui/InviteMemberForm.test.tsx src/modules/invitations/ui/InviteMemberForm.tsx
git add src/modules/provisioning/infrastructure/SingleTenantResolver.test.ts src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts
git add src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts
git add src/modules/waitlist/infrastructure/clerk/ClerkWaitlistBridge.ts src/modules/waitlist/ui/WaitlistJoinForm.tsx
git add src/security/core/node-provisioning-access.test.ts src/security/core/platform-admin.ts
git add src/shared/components/Header.test.tsx src/shared/components/Header.tsx
git add src/shared/lib/security/email-safety.ts
git add src/testing/integration/page.integration.test.tsx
git add 'docs/features/34 - Admin Bootstrap.md' docs/sdd/deployVercelPreview.yml docs/sdd/deployVercelProd.yml
```

Notes for those commands:

- `git add` on deleted paths is intentional and stages deletions too.
- The docs list is intentionally narrow and keeps only the bootstrap/deploy docs coupled to this rollout.
- Do not run `git add .` for PR3.

## How Bootstrap Works On Vercel After PR3

### Preview

- Preview deploy still has an idempotent bootstrap step in `.github/workflows/preview-deploy.yml`.
- The workflow first pulls preview env from Vercel.
- If `DATABASE_URL_UNPOOLED` is missing, bootstrap is skipped.
- If `BOOTSTRAP_ADMIN_EMAIL` or `BOOTSTRAP_ADMIN_PASSWORD` is missing in Preview env, bootstrap is skipped.
- If both are present, `scripts/bootstrap-admin.ts` runs against the preview database.
- `BOOTSTRAP_ORG_NAME` is optional; if absent, the script uses `Main Organization`.
- `DEFAULT_TENANT_ID` must already exist in Preview Vercel env when `TENANCY_MODE=single` because it is runtime config, not workflow-injected config anymore.

### Production

- Production deploy no longer has an automatic bootstrap step in `.github/workflows/prod-deploy.yml`.
- Production workflow now runs migrations and deploy only.
- First-admin bootstrap is a separate one-time operator action after deploy.
- Production bootstrap should be run against Production Vercel env pulled locally, with temporary bootstrap vars added only for that one run.

## How To Verify After PR3

### Preview Verification

Preview verification happens on the PR deployment, not after merge to `main`.

1. Open the preview deployment workflow logs.
2. Check the `Bootstrap Admin Account (idempotent)` step.
3. Expected outcomes:
   - if bootstrap vars are absent in Preview env: log shows explicit skip
   - if bootstrap vars are present: step runs `scripts/bootstrap-admin.ts`
4. Open the preview deployment URL.
5. Sign in with the preview bootstrap account if you intentionally enabled it.
6. Verify `/admin` loads.

### Production Verification After Merge

After PR3 merges to `main`:

1. Open the production deployment workflow logs.
2. Confirm there is no production bootstrap step anymore.
3. Confirm migrations and deploy completed successfully.
4. If production is a fresh environment, run the one-time bootstrap manually:

```shell
vercel env pull .env.production
echo "BOOTSTRAP_ADMIN_EMAIL=admin@company.com" >> .env.production
echo "BOOTSTRAP_ADMIN_PASSWORD=<strong-secret>" >> .env.production
# Optional:
# echo "BOOTSTRAP_ORG_NAME=Main Organization" >> .env.production
pnpm bootstrap:admin:prod:local
rm .env.production
```

5. Sign in to production with the bootstrap account.
6. Verify `/admin` loads.
7. Remove `BOOTSTRAP_ADMIN_PASSWORD` immediately from any place it was temporarily stored.
8. If you temporarily added `BOOTSTRAP_ADMIN_EMAIL` or `BOOTSTRAP_ORG_NAME` in Production Vercel env, remove them too after verification.

## Expected Operational Outcomes

- Preview can still auto-bootstrap, but only when Preview Vercel env explicitly enables it.
- Production never auto-bootstraps during deploy anymore.
- Production bootstrap is explicit, one-time, and operator-controlled.
- `DEFAULT_TENANT_ID` remains owned by Vercel env in both Preview and Production.
