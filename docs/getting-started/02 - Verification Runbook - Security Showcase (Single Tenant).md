# Verification Runbook - Security Showcase (Single Tenant)

## Purpose

Validate auth + provisioning + onboarding + route authorization in single-tenant mode.

Profile assumed:

- `AUTH_PROVIDER=clerk`
- `TENANCY_MODE=single`

## A) Pre-flight

```bash
pnpm env:check
pnpm db:migrate:dev
pnpm db:seed
pnpm dev
```

## B) Manual test flow

1. Open `/security-showcase`.
2. Sign in.
3. If redirected, complete `/onboarding`.
4. Return to `/security-showcase`.
5. Execute secure action: **Update Settings**.

## C) Expected outcomes

### 1. Success path

- no unhandled exception
- controlled success response from secure action

### 2. Controlled auth errors

Possible controlled responses:

- `Authentication required` (not signed in)
- `Forbidden` (policy denied)
- `Tenant context required` (misconfigured tenancy/profile)

## D) Important clarification for single mode

Do not debug Clerk organizations for this profile.

`TENANCY_MODE=single` does not require Clerk org context. Tenant is resolved from `DEFAULT_TENANT_ID`.

## E) Evidence to capture when reporting issues

1. Effective tenancy/auth env values (redact secrets)
2. terminal output around request
3. exact UI/server error message
4. whether onboarding submit returned success

## Related Docs

- `docs/getting-started/01 - Local Quickstart - Single Tenant.md`
- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
