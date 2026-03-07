# Clerk Onboarding

This document describes onboarding flow after the provisioning refactor.

## 1. What Onboarding Does Now

Onboarding is not just profile capture. It explicitly provisions internal records before saving profile fields.

`completeOnboarding()` flow (`src/modules/auth/ui/onboarding-actions.ts`):

1. Read raw external identity from `AUTH.IDENTITY_SOURCE`.
2. Call `PROVISIONING.SERVICE.ensureProvisioned(...)` with:
   - `provider`
   - `externalUserId`
   - `email` + `emailVerified`
   - `tenantExternalId` + `tenantRole`
   - `activeTenantId` (for `single` or `org/db` modes)
   - `tenancyMode` + `tenantContextSource`
3. Verify the provisioned internal user exists via `AUTH.USER_REPOSITORY.findById(internalUserId)`.
4. Persist onboarding profile in `AUTH.USER_REPOSITORY` using the canonical `internalUserId` returned by provisioning.

## 2. Persisted User Profile Fields

Onboarding writes these fields:

- `onboardingComplete` (boolean)
- `displayName`
- `locale`
- `timezone`

These fields are used by Node-side readiness checks through `UserRepository`.

## 3. Tenant Context Resolution During Onboarding

`resolveActiveTenantIdForProvisioning()` behavior:

1. `TENANCY_MODE=single` -> uses `DEFAULT_TENANT_ID`.
2. `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db` -> reads header `TENANT_CONTEXT_HEADER`, fallback cookie `TENANT_CONTEXT_COOKIE`.
3. Other modes -> no explicit `activeTenantId` is passed.

## 4. Access Behavior Before Provisioning

`src/app/onboarding/layout.tsx` does not bootstrap users directly:

- catches `UserNotProvisionedError`
- redirects to `/auth/bootstrap`
- if internal identity exists but user row is missing, also redirects to `/auth/bootstrap`

This is intentional: bootstrap is the primary provisioning write path. Onboarding only completes profile data after bootstrap succeeds.

After hardening:

- protected pages and APIs are gated in Node runtime,
- active Clerk session without internal provisioning returns controlled denial (`BOOTSTRAP_REQUIRED`),
- runtime probe endpoint `/api/me/provisioning-status` is the authoritative way to verify internal provisioning state.

## 5. Clerk Claims Used by Provisioning

For Clerk mode, onboarding relies on these mapped claims:

- `userId`
- `email`
- `emailVerified`
- `tenantExternalId` (org)
- `tenantRole` (org role)

If required tenant context is missing for the selected mode, provisioning fails with controlled domain errors.

## 6. Role Outcome on First Provisioning

Provisioning role assignment (new membership):

1. `TENANCY_MODE=single` -> `member`
2. `TENANCY_MODE=personal` -> `owner`
3. `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider`:
   - Clerk role containing `admin` or `owner` -> `owner`
   - otherwise -> `member`
4. `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`:
   - no auto-membership creation path
   - existing membership is required

## 7. Cross-Provider Email Linking Guard

Onboarding provisioning enforces `CROSS_PROVIDER_EMAIL_LINKING` policy:

- `verified-only` (default): link only if `emailVerified === true`
- `disabled`: never auto-link by email

This prevents unsafe account linking when email ownership is not verified.

## 8. Clerk Setup Checklist for Onboarding Tests

1. Set `AUTH_PROVIDER=clerk` with valid keys.
2. Set desired tenancy vars (`TENANCY_MODE`, `TENANT_CONTEXT_SOURCE`, `DEFAULT_TENANT_ID` when needed).
3. Run DB migrations and seed.
4. Ensure both Clerk sign-in and sign-up redirect to `/auth/bootstrap`.
5. Sign in via Clerk.
6. Complete onboarding form once if bootstrap redirects to `/onboarding`.
7. Confirm redirect behavior:
   - authenticated + onboarding complete -> no onboarding loop
   - unauthenticated -> redirect to sign-in
8. Optional verification after DB reset:
   - you may still have active Clerk session cookie,
   - `/api/me/provisioning-status` must return controlled `409 BOOTSTRAP_REQUIRED` until `/auth/bootstrap` re-provisions internal state,
   - after bootstrap, incomplete profile state redirects to `/onboarding`.

## 9. Related Docs

- `docs/features/15 - Clerk Authentication.md`
- `docs/features/ENV-requirements.md`
- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
