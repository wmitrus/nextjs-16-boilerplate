# Phase 14: Multi-Tenancy Readiness Seams

## Objective

Document the tenancy readiness seams already built into the boilerplate and verify they work correctly in the TanStack Start context. This phase does **not** implement a full multi-tenant product – it validates that the current design supports tenancy evolution without breaking changes.

**Prerequisite**: Phases 4–8 complete (auth, security, authorization, provisioning, features).

---

## Tenancy Model Overview

The boilerplate supports three tenancy modes, configured via `TENANCY_MODE`:

| Mode       | Description                                       | Use case                                          |
| ---------- | ------------------------------------------------- | ------------------------------------------------- |
| `single`   | All users share one tenant (default)              | Internal tools, MVPs, single-org apps             |
| `personal` | Each user has their own isolated tenant           | SaaS where user = org (e.g., personal workspaces) |
| `org`      | Multiple organizations, users are members of orgs | B2B SaaS with multiple companies                  |

The mode is set at deployment time via `TENANCY_MODE` env var. Switching modes requires a DB migration.

---

## 1. Tenancy Architecture in TanStack Start

### Identical to Next.js boilerplate

The tenancy contracts, resolvers, and domain logic are **100% reused**:

- `TenantResolver` contract (in `src/core/contracts/tenancy.ts`) – unchanged
- `SingleTenantResolver` – returns fixed tenant ID
- `PersonalTenantResolver` – derives tenant from user's internal ID
- `OrgDbTenantResolver` – resolves from header/cookie + DB membership check

### What changes vs Next.js

- `OrgProviderTenantResolver` (Clerk Organizations) is **deleted** – Better Auth is self-hosted, no Clerk org sync
- `TENANT_CONTEXT_SOURCE=provider` option is **removed** – tenant context always comes from DB or header/cookie
- `auth_tenant_identities` table is **removed** – no external tenant ID mapping

### Tenant context in server functions

```ts
// src/security/core/security-context.ts
export interface SecurityContext {
  userId: string;
  tenantId: string | undefined; // undefined in single-tenancy mode or when no tenant context
  // ...
}
```

Server functions receive `tenantId` via `SecurityContext`. They must not trust client-provided tenant IDs directly.

---

## 2. Tenant Resolution Flow

```
Request arrives
  └─> Auth middleware (function middleware)
        └─> getSession() → session.user.id (Better Auth ID)
              └─> RequestScopedIdentityProvider
                    └─> DrizzleInternalIdentityLookup.findByBetterAuthId()
                          └─> internal user UUID
                                └─> TenantResolver.resolve(identitySource)
                                      ├─ SingleTenantResolver → DEFAULT_TENANT_ID
                                      ├─ PersonalTenantResolver → user's personal tenant UUID
                                      └─ OrgDbTenantResolver → tenant from header/cookie + membership check
                                            └─> tenantId injected into SecurityContext
```

**Trust boundary**: The tenant ID in `SecurityContext` is derived from DB state (membership records), not from client-provided data. Client-sent `X-Tenant-Id` header is validated against DB membership before being accepted.

---

## 3. Tenant Isolation in Data Access

### Repository-level enforcement

All Drizzle repositories that handle tenant-scoped data must filter by `tenantId`:

```ts
// Pattern: always include tenantId in WHERE clause for tenant-scoped entities
async getUsersForTenant(tenantId: string) {
  return this.db
    .select()
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(eq(memberships.tenantId, tenantId))
}
```

**Rule**: Never query tenant-scoped data without a `tenantId` filter. This is a **data isolation invariant** – violation causes tenant data leakage.

### Server function enforcement pattern

```ts
export const getTenantUsers = createSecureServerFn({
  schema: z.object({}),
  handler: async ({ context }) => {
    const { tenantId } = context.securityContext;

    if (!tenantId) {
      return { status: 'tenant_context_required' as const };
    }

    // tenantId is from SecurityContext (server-derived, not client-provided)
    return getUsersForTenant(tenantId);
  },
});
```

---

## 4. Caching Safety (Critical)

**Risk**: If response caching does not include `tenantId` in the cache key, tenant A's data can be served to tenant B.

In TanStack Start:

- TanStack Query uses explicit query keys – include `tenantId` in keys for tenant-scoped data
- Server-side caching (if any) must include `tenantId` in cache key
- No shared cache across tenants for user-data queries

```ts
// CORRECT: tenantId in query key
queryOptions({
  queryKey: ['users', tenantId],
  queryFn: () => getTenantUsers(),
});

// WRONG: no tenantId in query key → potential tenant leakage
queryOptions({
  queryKey: ['users'],
  queryFn: () => getTenantUsers(),
});
```

---

## 5. `org` Tenancy Mode Setup

When `TENANCY_MODE=org`:

### Required DB schema

```ts
// Already in src/core/db/schema/
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').references(() => tenants.id, {
    onDelete: 'cascade',
  }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### Tenant context resolution

With `TENANCY_MODE=org` and `TENANT_CONTEXT_SOURCE=db`:

1. Request includes `X-Tenant-Id` header or `active_tenant_id` cookie
2. `OrgDbTenantResolver` reads the header/cookie
3. Checks `memberships` table: does this user have a membership in the requested tenant?
4. If yes → `tenantId` is set in `SecurityContext`
5. If no → `tenantId` is `undefined` → server function returns `tenant_membership_required`

### Tenant switching UI

```tsx
// Client-side tenant switcher
function TenantSwitcher({ memberships }: { memberships: Membership[] }) {
  const router = useRouter();

  async function switchTenant(tenantId: string) {
    // Set cookie via server function (not directly from client)
    await setActiveTenant({ data: { tenantId } });
    router.invalidate();
  }

  return (
    <select onChange={(e) => switchTenant(e.target.value)}>
      {memberships.map((m) => (
        <option key={m.tenantId} value={m.tenantId}>
          {m.tenantName}
        </option>
      ))}
    </select>
  );
}
```

The `setActiveTenant` server function validates that the user has membership in the requested tenant before setting the cookie:

```ts
export const setActiveTenant = createSecureServerFn({
  schema: z.object({ tenantId: z.uuid() }),
  handler: async ({ data, context }) => {
    // Validate membership in server function, not just from cookie
    const hasMembership = await checkMembership(
      context.session.user.id,
      data.tenantId,
    );

    if (!hasMembership) {
      return {
        status: 'unauthorized' as const,
        error: 'Not a member of this tenant',
      };
    }

    // Set the cookie server-side
    setCookie('active_tenant_id', data.tenantId, { httpOnly: true });
    return { status: 'success' as const };
  },
});
```

**Security rule**: Never trust client-set tenant IDs directly. Always validate membership server-side before accepting tenant context.

---

## 6. Future Tenancy Extensions

The current architecture supports these future extensions without breaking changes:

### Organization invitations

```ts
// New module: src/modules/invitations/
// Invite user to organization → creates pending invitation record
// User accepts → creates membership record
// Existing OrgDbTenantResolver works without changes
```

### Organization creation flow

```ts
// New server function: createOrganization
// Creates tenant record + initial membership (owner role)
// No changes to existing tenancy contracts
```

### Per-tenant feature flags

```ts
// FeatureFlagContext already includes tenantId
// Flags can be different per tenant without boilerplate changes
```

### ABAC with tenant ownership

```ts
// ResourceOwnerCondition can check tenantId
// TenantScopeCondition already enforces tenant isolation in authorization decisions
```

### Cross-tenant admin (super-admin)

```ts
// Requires special "system" role that bypasses tenant scoping
// Can be added as a new role without changing tenancy contracts
```

---

## 7. Tenancy Invariants (Must Not Be Violated)

These invariants must be preserved as the codebase grows:

| Invariant                                                    | How enforced                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Tenant ID in SecurityContext is server-derived               | `OrgDbTenantResolver` validates membership in DB; cookie/header is not trusted directly |
| All tenant-scoped queries include tenantId filter            | Code review + integration tests                                                         |
| TanStack Query keys include tenantId for tenant-scoped data  | Code review                                                                             |
| Switching tenants requires server-side membership validation | `setActiveTenant` server function                                                       |
| ABAC conditions include tenant scope check                   | `TenantScopeCondition` in `modules/authorization/domain/conditions/`                    |

---

## Risks

| Risk                                                                                                | Severity      | Mitigation                                                                         |
| --------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| Developer adds query without tenantId filter – silent tenant data leakage                           | CRITICAL      | Integration test: query-level tenant isolation test for every repo method          |
| TanStack Query cache not keyed by tenantId – serves wrong tenant's data                             | CRITICAL      | ESLint custom rule: warn when `tenantId` is in SecurityContext but not in queryKey |
| Tenant switch cookie set client-side (bypassing server validation)                                  | CRITICAL      | Rule: only set `active_tenant_id` cookie from server functions                     |
| Super-admin accessing multiple tenants – cache key may still be tenant-scoped                       | MAJOR         | Super-admin flows must bypass cache or use their own query key namespace           |
| `single` mode hardcodes `DEFAULT_TENANT_ID` – upgrading to `org` mode later requires data migration | INFORMATIONAL | Document upgrade path in `TENANCY_MODE` env var description                        |

---

## Validation

Phase 14 is complete when:

- [ ] `TENANCY_MODE=single`: all server functions use `DEFAULT_TENANT_ID`
- [ ] `TENANCY_MODE=personal`: each user has isolated personal tenant, cannot see other users' data
- [ ] `TENANCY_MODE=org`: `setActiveTenant` validates membership; `OrgDbTenantResolver` rejects unknown tenants
- [ ] TanStack Query keys include `tenantId` for all tenant-scoped data queries
- [ ] Integration test: user A cannot access tenant B's data (data isolation)
- [ ] Integration test: switching to a tenant the user is not a member of returns `unauthorized`
- [ ] Integration test: `createSecureServerFn` returns `tenant_context_required` when no tenant context in org mode
- [ ] `pnpm typecheck` passes
