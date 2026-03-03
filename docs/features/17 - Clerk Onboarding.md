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
3. Resolve internal identity (`AUTH.IDENTITY_PROVIDER`).
4. Persist onboarding profile in `AUTH.USER_REPOSITORY` using internal UUID.

## 2. Persisted User Profile Fields

Onboarding writes these fields:

- `onboardingComplete` (boolean)
- `targetLanguage`
- `proficiencyLevel`
- `learningGoal`

These fields are used by middleware onboarding checks (`with-auth`) through `UserRepository`.

## 3. Tenant Context Resolution During Onboarding

`resolveActiveTenantIdForProvisioning()` behavior:

1. `TENANCY_MODE=single` -> uses `DEFAULT_TENANT_ID`.
2. `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db` -> reads header `TENANT_CONTEXT_HEADER`, fallback cookie `TENANT_CONTEXT_COOKIE`.
3. Other modes -> no explicit `activeTenantId` is passed.

## 4. Access Behavior Before Provisioning

`src/app/onboarding/layout.tsx` allows authenticated users with no internal identity mapping:

- catches `UserNotProvisionedError`
- keeps user on onboarding page

This is intentional: onboarding is the write path that creates mappings and tenant membership.

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
4. Sign in via Clerk.
5. Complete onboarding form once.
6. Confirm redirect behavior:
   - authenticated + onboarding complete -> no onboarding loop
   - unauthenticated -> redirect to sign-in

## 9. Related Docs

- `docs/features/15 - Clerk Authentication.md`
- `docs/features/ENV-requirements.md`
- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
