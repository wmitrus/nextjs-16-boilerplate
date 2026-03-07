# Clerk Authentication

This document describes Clerk integration in the current modular monolith architecture.

## 1. Scope

Clerk is one supported `AUTH_PROVIDER` adapter. It is integrated through contracts, not directly through domain code.

Current provider status:

- `clerk`: runtime-ready.
- `authjs`, `supabase`: architecture-ready, adapter implementation pending.

## 2. Runtime Boundaries

Clerk-specific SDK usage is limited to delivery/infrastructure boundaries:

- `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
- `src/proxy.ts` (`clerkMiddleware` path)
- `src/app/layout.tsx` (`ClerkProvider` path only when `AUTH_PROVIDER=clerk`)
- Clerk UI routes/components (`/sign-in`, `/sign-up`, waitlist, header auth controls)

Core contracts, provisioning domain, authorization domain, and security core do not import Clerk SDK APIs.

## 3. Claims Mapping Contract

`ClerkRequestIdentitySource` maps provider claims to `RequestIdentitySourceData`:

- `userId` <- Clerk `userId`
- `email` <- `sessionClaims.email`
- `emailVerified` <- `sessionClaims.email_verified === true`
- `tenantExternalId` <- Clerk `orgId`
- `tenantRole` <- Clerk `orgRole`

This data is external-only. Internal UUID resolution happens separately via `InternalIdentityLookup` and provisioning.

## 4. Env Setup (Clerk)

Required only when `AUTH_PROVIDER=clerk`:

- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Common optional route vars:

- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_WAITLIST_URL`

## 5. Layout and UI Behavior

`src/app/layout.tsx` conditionally wraps with `ClerkProvider` only for `AUTH_PROVIDER=clerk`.

- Clerk mode: full Clerk auth context is enabled.
- Non-Clerk mode: app renders without Clerk provider and without Clerk auth UI crash.

`/sign-in` and `/sign-up` pages are provider-aware:

- Clerk mode: render Clerk components.
- Non-Clerk mode: show informative "not configured" message.

## 6. Proxy Behavior

`src/proxy.ts` selects runtime path by `AUTH_PROVIDER`:

- Clerk mode: wraps pipeline with `clerkMiddleware`, builds request-scoped identity source from Clerk auth callback.
- Non-Clerk mode: runs same security middleware chain without Clerk wrapper.

This preserves edge/node composition boundaries and avoids provider leakage.

Important:

- Edge middleware validates session presence only.
- Internal provisioning/onboarding truth is enforced by Node gate on protected pages/APIs.
- Use `/api/me/provisioning-status` as authoritative runtime probe.

## 7. Clerk Organizations vs Tenancy

Clerk orgs are optional and depend on tenancy mode:

1. `TENANCY_MODE=single`: org claims are ignored.
2. `TENANCY_MODE=personal`: org claims are ignored.
3. `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider`: `tenantExternalId` (Clerk org) is required.
4. `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`: active tenant comes from app header/cookie context, not provider org claim.

Dashboard requirements by scenario:

| Tenancy profile | Organizations feature | Clerk org membership | Active org in session | Additional requirement                      |
| --------------- | --------------------- | -------------------- | --------------------- | ------------------------------------------- |
| `single`        | optional              | not required         | not required          | email sign-in enabled                       |
| `personal`      | optional              | not required         | not required          | email sign-in enabled                       |
| `org/provider`  | required              | required             | required              | assign org role for owner/member path tests |
| `org/db`        | optional (ignored)    | not required         | not required          | set active tenant in app header/cookie      |

Minimal universal Clerk baseline:

1. Configure `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
2. Enable email sign-in/sign-up.
3. Use verified test emails when validating cross-provider linking policy (`CROSS_PROVIDER_EMAIL_LINKING=verified-only`).

## 8. Related Docs

- `docs/features/ENV-requirements.md`
- `docs/features/17 - Clerk Onboarding.md`
- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
