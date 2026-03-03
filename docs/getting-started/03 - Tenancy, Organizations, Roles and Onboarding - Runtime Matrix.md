# Tenancy, Organizations, Roles and Onboarding - Runtime Matrix

This is the canonical runtime guide for testing all tenant/org/role/onboarding use cases.

## 1. Current Runtime Support Matrix

### 1.1 By auth provider

| AUTH_PROVIDER | Runtime status | Notes                                                 |
| ------------- | -------------- | ----------------------------------------------------- |
| `clerk`       | Ready          | Full flow available with current adapters.            |
| `authjs`      | Not ready yet  | Identity source adapter is placeholder (no `userId`). |
| `supabase`    | Not ready yet  | Identity source adapter is placeholder (no `userId`). |

### 1.2 By tenancy mode (with Clerk)

| TENANCY_MODE | TENANT_CONTEXT_SOURCE | Status                           | Organization required in Clerk? |
| ------------ | --------------------- | -------------------------------- | ------------------------------- |
| `single`     | ignored               | Ready                            | No                              |
| `personal`   | ignored               | Ready                            | No                              |
| `org`        | `provider`            | Ready                            | Yes                             |
| `org`        | `db`                  | Ready (with existing membership) | No (optional)                   |

## 2. Environment Recipes

## 2.1 Single tenant (shared tenant)

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=single
DEFAULT_TENANT_ID=550e8400-e29b-41d4-a716-446655440000
```

Behavior:

- tenant context always resolves to `DEFAULT_TENANT_ID`
- no Clerk organization requirement
- first onboarding creates internal user + membership role `member`

## 2.2 Personal tenant (tenant per user)

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=personal
```

Behavior:

- first onboarding creates personal tenant for user
- membership role is `owner`
- no Clerk organization requirement

## 2.3 Org via provider claim (Clerk Organizations)

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=provider
```

Behavior:

- requires `tenantExternalId` claim from provider (`orgId`)
- missing org context -> `MissingTenantContextError`
- first onboarding maps org to internal tenant and creates membership
- role from provider claim mapping:
  - claim containing `admin`/`owner` -> `owner`
  - otherwise -> `member`

## 2.4 Org via DB-selected tenant

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=db
TENANT_CONTEXT_HEADER=x-tenant-id
TENANT_CONTEXT_COOKIE=active_tenant_id
```

Behavior:

- active tenant comes from header/cookie
- user must already be member of selected tenant
- no auto-membership creation in this path
- missing active tenant -> `MissingTenantContextError`
- non-member -> `TenantMembershipRequiredError`

## 3. Clerk Setup by Tenancy Use Case

## 3.1 Single

1. Create Clerk app and keys.
2. Do not configure organizations unless you want them for UI.
3. Sign in and complete onboarding.

## 3.2 Personal

1. Create Clerk app and keys.
2. Do not configure organizations.
3. Sign in and complete onboarding.

## 3.3 Org + provider source

1. Enable Clerk Organizations.
2. Create at least one organization.
3. Add test user to organization.
4. Ensure active organization is selected in session.
5. Sign in and complete onboarding.

## 3.4 Org + DB source

1. Organizations in Clerk are optional.
2. Ensure internal tenant + membership already exist in DB.
3. Set active tenant via header/cookie in requests.
4. Sign in and access protected routes.

## 4. Internal Role Model

Canonical internal roles are:

- `owner`
- `member`

Default policy template grants:

- `owner`: full tenant management actions (users, tenant, billing, security, route access)
- `member`: limited actions (route access, self user read/update, tenant read, billing read)

## 5. Onboarding and Provisioning Flow

On onboarding submit (`completeOnboarding`):

1. `ensureProvisioned(...)` runs first.
2. Internal user/tenant/membership mapping is ensured idempotently.
3. User profile fields are saved.
4. `onboardingComplete=true` is persisted.

Saved profile fields:

- `targetLanguage`
- `proficiencyLevel`
- `learningGoal`
- `onboardingComplete`

## 6. Cross-Provider Linking Policy

Var:

- `CROSS_PROVIDER_EMAIL_LINKING=verified-only|disabled`

Rules:

1. `verified-only` (default): cross-provider link allowed only when `emailVerified === true`.
2. `disabled`: cross-provider email auto-linking is blocked.

## 7. Runtime Test Checklist Per Scenario

Use the same flow for each supported scenario (`single`, `personal`, `org/provider`, `org/db`).

1. Set env profile.
2. Run:
   - `pnpm env:check`
   - `pnpm db:migrate:dev`
   - `pnpm db:seed`
   - `pnpm dev`
3. Sign in.
4. Complete onboarding (if first login).
5. Validate protected page and secure action behavior.
6. Validate expected error when intentionally breaking tenant context.

## 8. Expected Controlled Errors

| Situation                                                                                     | Expected result                                 |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Not signed in                                                                                 | `Authentication required` / redirect to sign-in |
| Missing tenant context (`org/provider` without active org, or `org/db` without header/cookie) | `Tenant context required`                       |
| Tenant selected but user not member (`org/db`)                                                | `Tenant membership required`                    |
| Policy denies action                                                                          | `Forbidden`                                     |
| Provisioning blocked by email linking policy                                                  | controlled provisioning failure                 |

## 9. Important Testing Limitation

`authjs` and `supabase` adapters are not implemented yet, so runtime tests for those providers are expected to fail at identity acquisition stage.

Use Clerk profiles to validate tenancy/provisioning logic now; add provider-specific runtime tests after adapter implementation.

## 10. Code References

- env schema: `src/core/env.ts`
- auth module resolver wiring: `src/modules/auth/index.ts`
- clerk identity source: `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
- onboarding action: `src/modules/auth/ui/onboarding-actions.ts`
- provisioning service: `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`
- route auth middleware: `src/security/middleware/with-auth.ts`
