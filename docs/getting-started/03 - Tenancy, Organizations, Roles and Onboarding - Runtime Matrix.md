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
DEFAULT_TENANT_ID=10000000-0000-4000-8000-000000000001
```

Behavior:

- tenant context always resolves to `DEFAULT_TENANT_ID`
- no Clerk organization requirement
- first authenticated bootstrap creates internal user + membership role `member`
- onboarding completes generic profile fields after bootstrap succeeds

## 2.2 Personal tenant (tenant per user)

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=personal
```

Behavior:

- first authenticated bootstrap creates personal tenant for user
- membership role is `owner`
- no Clerk organization requirement
- onboarding completes generic profile fields after bootstrap succeeds

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
- first authenticated bootstrap maps org to internal tenant and creates membership
- role from provider claim mapping:
  - claim containing `admin`/`owner` -> `owner`
  - otherwise -> `member`
- onboarding completes generic profile fields after bootstrap succeeds

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

Common baseline (all scenarios):

1. Set valid Clerk keys in env:
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
2. Enable email sign-in/sign-up in Clerk.
3. Use verified test emails when validating `CROSS_PROVIDER_EMAIL_LINKING=verified-only`.

### 3.1 Scenario `TENANCY_MODE=single`

| Step | Command / Action                                             | Expected                                                                       |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| S-1  | Keep Organizations disabled (or enabled but unused).         | provider org context not required                                              |
| S-2  | Ensure test user exists in Clerk and can sign in.            | authenticated session works                                                    |
| S-3  | Sign in and confirm redirect lands on `/auth/bootstrap`.     | bootstrap route executes before any protected page                             |
| S-4  | Complete onboarding if bootstrap redirects to `/onboarding`. | internal user is provisioned in shared default tenant and profile is completed |

### 3.2 Scenario `TENANCY_MODE=personal`

| Step | Command / Action                                             | Expected                                                    |
| ---- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| P-1  | Keep Organizations disabled (or enabled but unused).         | provider org context not required                           |
| P-2  | Ensure test user can sign in with email auth.                | authenticated session works                                 |
| P-3  | Sign in and confirm redirect lands on `/auth/bootstrap`.     | personal tenant is provisioned before onboarding            |
| P-4  | Complete onboarding if bootstrap redirects to `/onboarding`. | personal tenant is created and linked; profile is completed |

### 3.3 Scenario `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider`

| Step | Command / Action                                                                                                                      | Expected                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| OP-1 | Enable Organizations in Clerk Dashboard.                                                                                              | organization APIs and claims are available    |
| OP-2 | Create organization for tests (example: `org-provider-test`).                                                                         | org exists                                    |
| OP-3 | Add test user to that organization.                                                                                                   | membership exists in Clerk                    |
| OP-4 | Set that organization as active in current session (UserButton account/org context).                                                  | provider session exposes `orgId` claim        |
| OP-5 | Set org role in Clerk for role-path tests:<br/>- contains `admin` or `owner` -> internal `owner`<br/>- otherwise -> internal `member` | deterministic role mapping in provisioning    |
| OP-6 | Complete onboarding and access protected routes.                                                                                      | no `TENANT_CONTEXT_REQUIRED` on positive path |

### 3.4 Scenario `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`

| Step | Command / Action                                                          | Expected                                                             |
| ---- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| OD-1 | Organizations are optional in Clerk (can remain disabled).                | provider org context is ignored in resolver                          |
| OD-2 | Ensure test user can sign in with email auth.                             | authenticated session works                                          |
| OD-3 | Ensure internal tenant membership exists in app DB.                       | positive path is reachable                                           |
| OD-4 | Set active tenant via `TENANT_CONTEXT_HEADER` or `TENANT_CONTEXT_COOKIE`. | tenant context resolved from app-controlled source                   |
| OD-5 | Access protected routes/actions.                                          | member tenant -> success, non-member -> `TENANT_MEMBERSHIP_REQUIRED` |

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

- `displayName`
- `locale`
- `timezone`
- `onboardingComplete`

## 6. Cross-Provider Linking Policy

Var:

- `CROSS_PROVIDER_EMAIL_LINKING=verified-only|disabled`

Rules:

1. `verified-only` (default): cross-provider link allowed only when `emailVerified === true`.
2. `disabled`: cross-provider email auto-linking is blocked.

## 7. Runtime Test Checklist Per Scenario

Authoritative runtime flow is defined in `04` and `05`.

Execution model:

1. Use chained mode (`A -> B -> C -> D`) with one DB state and one browser session.
2. Run setup once:
   - `pnpm env:check`
   - `pnpm db:migrate:dev`
   - `pnpm db:seed`
   - `pnpm dev`
3. Validate positive/negative paths on `/users` and `/api/users`.
4. Validate provisioning truth on `/api/me/provisioning-status` (authoritative probe).
5. Treat `/security-showcase` mutation as diagnostic (non-gating) until explicit policy mapping for that action is aligned.
6. Run mandatory non-UI provisioning security gates:
   - `pnpm test:db -- src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts -t "cross-provider email linking"`
   - `pnpm test:db -- src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts -t "free-tier limit"`

## 8. Expected Controlled Errors

| Situation                                                                                     | Expected result                                 |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Not signed in                                                                                 | `Authentication required` / redirect to sign-in |
| Signed in externally, not provisioned internally                                              | `BOOTSTRAP_REQUIRED` (API `409`)                |
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
- node provisioning gate: `src/security/core/node-provisioning-access.ts`
- authoritative runtime probe: `src/app/api/me/provisioning-status/route.ts`
