# Incident Intake

## Incident Description

Unstable Clerk sign-up and provisioning flow. Org/tenant state can come from Clerk or the database depending on env configuration, and provisioning from Clerk into the database repeatedly breaks during new-user onboarding.

## Suspected Severity

**MAJOR** — User-facing: new users cannot complete sign-up in certain tenancy configurations. Not a data breach or auth bypass, but blocks product onboarding entirely for affected users.

## Affected Surface

- `src/app/auth/bootstrap/page.tsx` — bootstrap RSC page calling `ensureProvisioned`
- `src/modules/auth/ui/onboarding-actions.ts` — `completeOnboarding` server action (second `ensureProvisioned` call)
- `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts` — `ensureProvisioned` implementation
- `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts` — Clerk session claim extraction
- `src/modules/auth/index.ts` — tenant resolver selection, auth module wiring
- `src/security/middleware/with-auth.ts` — onboarding redirect enforcement
- `src/proxy.ts` — edge middleware identity/tenant resolution

## Known Symptoms

1. New user signs up via Clerk (`/sign-up`) → redirected to `/auth/bootstrap` → bootstrap page shows error UI instead of redirecting to `/onboarding`
2. Error: `BootstrapErrorUI error="tenant_config"` — seen for configurations that need tenant context from Clerk session or DB
3. Provisioning fails again when `completeOnboarding` server action is submitted (second call fails if first already failed)
4. Behavior differs across env configurations: `TENANCY_MODE=single`, `TENANCY_MODE=personal`, `TENANCY_MODE=org+provider`, `TENANCY_MODE=org+db` each have different failure modes
5. May work for one user but fail for another in the same configuration (race conditions in concurrent sign-ups)

## Known Constraints

- Must not change the `ProvisioningInput` contract shape
- Must not change how Clerk session claims are read (no new Clerk SDK calls)
- Must not affect existing signed-in users or existing tenants
- Must preserve idempotency guarantees of `ensureProvisioned`
- Must preserve transactional integrity within `DrizzleProvisioningService`
- Next.js 16 App Router — bootstrap is an RSC page, onboarding form uses a server action
- Clerk v6 — `auth()` is async, session claims shape depends on Clerk dashboard configuration

## Initial Unknowns

1. **Which specific `TENANCY_MODE` + `TENANT_CONTEXT_SOURCE` combinations are breaking** — all, some, or only `org` modes?
2. **Are Clerk session claims (`email`, `email_verified`, `orgId`) present at sign-up time** in this project's Clerk dashboard configuration?
3. **Is `DEFAULT_TENANT_ID` seeded in all deployment environments** for `single` mode?
4. **Is the instability deterministic** (always fails) or flaky (race condition)?
5. **Does `ClerkRequestIdentitySource.cached` cause problems** — each `getAppContainer()` call creates a fresh instance, meaning `auth()` is called per request which is correct, but could cause issues if multiple `getAppContainer()` calls are made within a single request scope
6. **Are there any webhook endpoints** that Clerk should be calling to trigger provisioning as an alternative path?

---

## Detailed Root Cause Analysis

### Root Cause 1: `org + provider` mode — Clerk orgId not present at sign-up time

**File**: `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`

```typescript
return {
  userId: userId ?? undefined,
  email,
  emailVerified: sessionClaims?.email_verified === true ? true : undefined,
  tenantExternalId: orgId ?? undefined, // ← Clerk orgId from session
  tenantRole: orgRole ?? undefined,
};
```

When `TENANCY_MODE=org` and `TENANT_CONTEXT_SOURCE=provider`, the provisioning service requires `tenantExternalId` (Clerk `orgId`). However, newly signed-up users who were not invited to a Clerk Organization will have `orgId = null` in their first session. `ensureProvisioned` then throws `TenantContextRequiredError`, and bootstrap shows an error page. The user is stuck — they cannot reach onboarding and cannot self-provision a tenant.

**Affected path**: `resolveTenant` in `DrizzleProvisioningService.ts`:

```typescript
if (tenancyMode === 'org') {
  if (tenantContextSource === 'provider') {
    if (!input.tenantExternalId) {
      throw new TenantContextRequiredError(
        'TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider requires tenantExternalId ...',
      );
    }
    ...
  }
}
```

### Root Cause 2: `single` mode — DEFAULT_TENANT_ID not seeded

**File**: `src/app/auth/bootstrap/page.tsx` + `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`

For `TENANCY_MODE=single`, `resolveTenant` reads the tenant by `activeTenantId = DEFAULT_TENANT_ID` from env. If the tenant row doesn't exist in DB:

```typescript
const rows = await db
  .select({ id: tenantsTable.id })
  .from(tenantsTable)
  .where(eq(tenantsTable.id, input.activeTenantId))
  .limit(1);
if (!rows[0]) {
  throw new TenantNotProvisionedError(
    `Single tenant '${input.activeTenantId}' does not exist. Ensure DEFAULT_TENANT_ID is seeded.`,
  );
}
```

Bootstrap catches this as `TenantNotProvisionedError` but maps it to the same `tenant_config` error UI as `TenantContextRequiredError`. Both are opaque to operators.

### Root Cause 3: `org + db` mode — no cookie/header for new users

**File**: `src/modules/auth/ui/onboarding-actions.ts`

```typescript
async function resolveActiveTenantIdForProvisioning(): Promise<
  string | undefined
> {
  if (env.TENANCY_MODE === 'org' && env.TENANT_CONTEXT_SOURCE === 'db') {
    const headerTenantId = headerList.get(env.TENANT_CONTEXT_HEADER);
    if (headerTenantId) return headerTenantId;
    const cookieStore = await cookies();
    return cookieStore.get(env.TENANT_CONTEXT_COOKIE)?.value;
  }
  return undefined;
}
```

New users have no pre-existing `active_tenant_id` cookie or `x-tenant-id` header. There is no flow to set the cookie before bootstrap. `activeTenantId = undefined` → `TenantContextRequiredError` in provisioning.

### Root Cause 4: `email_verified` claim absent from default Clerk session token

**File**: `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`

```typescript
emailVerified: sessionClaims?.email_verified === true ? true : undefined,
```

Clerk's default session token (v2) does NOT include `email` or `email_verified` in session claims by default. These must be explicitly added as custom session claims in the Clerk dashboard. If not configured:

- `email` = undefined → provisioning uses synthetic fallback email `external+clerk-<id>@local.invalid`
- `emailVerified` = undefined → cross-provider email linking always blocked

The fallback email path works for the happy path (idempotent), but creates a silent configuration dependency that operators may not know about. The warning log is emitted but not surfaced to the operator.

### Root Cause 5: Duplicate provisioning call between bootstrap and onboarding action

Both `src/app/auth/bootstrap/page.tsx` and `src/modules/auth/ui/onboarding-actions.ts` call `ensureProvisioned`. The intent is for bootstrap to create the record and onboarding action to be idempotent. However, this creates two code paths that must both remain correct and in sync — any divergence in how they pass `tenantExternalId`, `activeTenantId`, or `tenancyMode` causes inconsistency.

**Structural risk**: The `resolveActiveTenantIdForProvisioning` helper is duplicated between both files with identical logic. If one is updated and the other isn't, provisioning will diverge between bootstrap and onboarding.

### Root Cause 6: `getAppContainer()` creates a new container per call — not per request

**File**: `src/core/runtime/bootstrap.ts`

```typescript
export function getAppContainer(): Container {
  return createRequestContainer(buildConfig());
}
```

Each call creates a new `ClerkRequestIdentitySource` instance. Since `ClerkRequestIdentitySource.cached` is instance-scoped, each call to `getAppContainer()` results in a fresh Clerk `auth()` call. In current code each page/action calls `getAppContainer()` once, so this is tolerable. But it is a latent risk: if `getAppContainer()` is called multiple times within a single request (e.g., two places in the same server action call stack), Clerk `auth()` would be called multiple times and could in theory return slightly different states if the session changes between calls (JWT refresh window).

This also means there is no request-scoped container singleton — a different container is used by middleware, bootstrap page, and onboarding server action, even for the same HTTP request context.

### Root Cause 7: `ClerkUserRepository` is wired separately from `DrizzleUserRepository`

**File**: `src/modules/auth/infrastructure/ClerkUserRepository.ts`

This file exists and stores `onboardingComplete` in Clerk `publicMetadata`. The auth module wires `DrizzleUserRepository` as `AUTH.USER_REPOSITORY`. If `ClerkUserRepository` was ever used for `userRepository.findById` in middleware or elsewhere, `onboardingComplete` would be read from Clerk — but `updateOnboardingStatus` in onboarding-actions.ts writes to the DB (via `DrizzleUserRepository`). This is a **dual-backend risk**: if `ClerkUserRepository` is ever registered as `AUTH.USER_REPOSITORY`, writes go to DB but reads could come from Clerk, creating a permanent inconsistency.

Currently this file appears unused in the container wiring but its existence is a footgun.

## Summary of Failure Scenarios by Mode

| TENANCY_MODE | TENANT_CONTEXT_SOURCE | Breaks?       | Cause                                |
| ------------ | --------------------- | ------------- | ------------------------------------ |
| `single`     | N/A                   | Yes (config)  | `DEFAULT_TENANT_ID` not seeded in DB |
| `personal`   | N/A                   | No (usually)  | Creates personal tenant on demand    |
| `org`        | `provider`            | Yes (runtime) | Clerk `orgId` absent at sign-up time |
| `org`        | `db`                  | Yes (runtime) | No cookie/header for new user        |
