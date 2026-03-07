# Environment Requirements

This document is the runtime source of truth for environment setup after the tenancy/provisioning refactor.

All vars are defined in `src/core/env.ts`.

## 1. Setup Commands

Create local env file:

```bash
pnpm env:init
```

Validate env schema consistency:

```bash
pnpm env:check
```

## 2. Configuration Axes

Runtime behavior is controlled by independent axes:

1. `AUTH_PROVIDER=clerk|authjs|supabase`
2. `TENANCY_MODE=single|personal|org`
3. `TENANT_CONTEXT_SOURCE=provider|db` (required only for `TENANCY_MODE=org`)

## 3. Cross-Field Validation Rules

The app fails fast at startup when these rules are violated:

1. `TENANCY_MODE=single` requires `DEFAULT_TENANT_ID` (valid UUID).
2. `TENANCY_MODE=org` requires `TENANT_CONTEXT_SOURCE`.
3. `AUTH_PROVIDER=clerk` requires:
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

## 4. Auth Provider Vars

### 4.1 Clerk (required only when `AUTH_PROVIDER=clerk`)

- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Optional Clerk route vars:
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`
  - `NEXT_PUBLIC_CLERK_WAITLIST_URL`

### 4.2 Auth.js / Supabase

No Clerk keys are required when `AUTH_PROVIDER=authjs|supabase`.

Important current status:

- `AuthJsRequestIdentitySource` and `SupabaseRequestIdentitySource` are placeholder adapters (return no authenticated identity).
- These providers are architecture-ready but not runtime-complete yet.

## 5. Tenancy Vars

- `TENANCY_MODE=single|personal|org`
- `DEFAULT_TENANT_ID` (required for `single`)
- `TENANT_CONTEXT_SOURCE=provider|db` (required for `org`)
- `TENANT_CONTEXT_HEADER` (default: `x-tenant-id`)
- `TENANT_CONTEXT_COOKIE` (default: `active_tenant_id`)

Provisioning-related vars:

- `FREE_TIER_MAX_USERS` (default: `5`)
- `CROSS_PROVIDER_EMAIL_LINKING=disabled|verified-only` (default: `verified-only`)

## 6. Minimal Runtime Profiles

### Profile A: Clerk + Single Tenant

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=single
DEFAULT_TENANT_ID=10000000-0000-4000-8000-000000000001
```

### Profile B: Clerk + Personal Tenant

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=personal
```

### Profile C: Clerk + Org (provider context)

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=provider
```

### Profile D: Clerk + Org (db context)

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=db
TENANT_CONTEXT_HEADER=x-tenant-id
TENANT_CONTEXT_COOKIE=active_tenant_id
```

## 7. Shared Infrastructure Vars

Commonly required:

- `DB_PROVIDER`
- `DB_DRIVER`
- `DATABASE_URL` (required for postgres driver)
- `NODE_ENV`

Security and ops vars remain optional with defaults unless your deployment policy requires strict values.

## 8. Production Notes

1. Keep secrets only in deployment secret stores.
2. Never commit real keys to `.env.example`.
3. Validate env before deploy using `pnpm env:check` and CI gates.

## 9. Canonical References

- Env schema: `src/core/env.ts`
- Bootstrap validation: `src/core/runtime/bootstrap.ts`
- Tenancy resolver wiring: `src/modules/auth/index.ts`
- Provisioning flow: `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`
