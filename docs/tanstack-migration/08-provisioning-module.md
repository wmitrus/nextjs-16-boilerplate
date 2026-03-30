# Phase 7: Provisioning Module – Simplified Bootstrap

## Objective

Adapt the provisioning module. With Better Auth replacing Clerk, the provisioning complexity is **significantly reduced** – the external ID mapping write-path disappears entirely. This phase documents what remains, what is removed, and what the new provisioning flow looks like.

**Prerequisite**: Phase 4 (Auth Module) and Phase 6 (Authorization Module) complete.

---

## What Changes

| File/Dir                                                                        | Status           | Change                                     |
| ------------------------------------------------------------------------------- | ---------------- | ------------------------------------------ |
| `src/modules/provisioning/domain/`                                              | **Reused as-is** | Domain logic unchanged                     |
| `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts` | **Adapted**      | Simplified: no external ID mapping         |
| `src/modules/provisioning/infrastructure/OrgDbTenantResolver.ts`                | **Reused**       | No change                                  |
| `src/modules/provisioning/infrastructure/PersonalTenantResolver.ts`             | **Adapted**      | Uses Better Auth ID instead of external ID |
| `src/modules/provisioning/infrastructure/SingleTenantResolver.ts`               | **Reused as-is** | No change                                  |
| `src/modules/provisioning/infrastructure/OrgProviderTenantResolver.ts`          | **Deleted**      | Clerk Organizations-specific               |
| `src/modules/provisioning/infrastructure/request-context/`                      | **Reused as-is** | Header/Cookie tenant sources               |
| `src/app/routes/auth/bootstrap.tsx`                                             | **New**          | Bootstrap route (TanStack Router)          |

---

## 1. Why Provisioning Simplifies with Better Auth

### Next.js + Clerk provisioning problem

Clerk is an **external** auth provider. When a user signs in with Clerk for the first time:

1. Clerk creates an external user with a Clerk-specific ID (e.g., `user_abc123`)
2. The app must map this to an **internal user UUID** (e.g., `6f4d9e8a-...`)
3. This mapping requires:
   - `auth_user_identities` table: `(provider='clerk', externalId='user_abc123') → internalId='6f4d9e8a-...'`
   - `DrizzleInternalIdentityLookup` for read-path
   - `ProvisioningService.ensureProvisioned()` for write-path (creates the mapping)
4. For organizations: same complexity with `auth_tenant_identities` table

### TanStack Start + Better Auth: no mapping needed

Better Auth is **self-hosted**. It creates a `ba_user` record in YOUR database with its own `id`. The `users` table simply stores a `betterAuthId` column pointing to the `ba_user.id`.

- No `auth_user_identities` table
- No `auth_tenant_identities` table
- No external ID mapping write-path
- `DrizzleInternalIdentityLookup` simplified to a single `betterAuthId` lookup

Provisioning still handles:

- Creating the domain `users` record (linked to `betterAuthId`) on first login
- Creating the domain `tenants` record (for personal tenancy)
- Creating the `memberships` record
- Running onboarding checks
- Seeding default roles and permissions

---

## 2. `DrizzleProvisioningService` – Adapted

### Key simplification

The `ensureProvisioned()` method no longer needs to:

- Create `auth_user_identities` records
- Create `auth_tenant_identities` records
- Handle cross-provider email linking
- Manage the `(provider, externalId)` composite key

It now needs to:

- Find or create the domain `users` record linked by `betterAuthId`
- Find or create the domain `tenants` record (personal mode)
- Find or create `memberships` record
- Seed default roles/permissions
- Validate tenancy constraints

```ts
// src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts (adapted)
import type { DrizzleDb } from '@/core/db';
import { users, tenants, memberships } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import type { ProvisioningService } from '@/core/contracts/provisioning-access';

export class DrizzleProvisioningService implements ProvisioningService {
  constructor(
    private readonly db: DrizzleDb,
    private readonly freeTierMaxUsers: number,
  ) {}

  async ensureProvisioned(params: {
    betterAuthId: string;
    email: string;
    name?: string;
  }): Promise<{ userId: string; tenantId?: string }> {
    // 1. Find or create internal user record
    let user = await this.db
      .select()
      .from(users)
      .where(eq(users.betterAuthId, params.betterAuthId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!user) {
      const [created] = await this.db
        .insert(users)
        .values({
          betterAuthId: params.betterAuthId,
          email: params.email,
          name: params.name,
          onboardingCompleted: false,
        })
        .returning();

      user = created!;
    }

    return { userId: user.id };
  }

  async checkReadiness(betterAuthId: string): Promise<ReadinessStatus> {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.betterAuthId, betterAuthId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!user) {
      return 'BOOTSTRAP_REQUIRED';
    }

    if (!user.onboardingCompleted) {
      return 'ONBOARDING_REQUIRED';
    }

    return 'READY';
  }
}
```

---

## 3. Bootstrap Route (TanStack Router)

The bootstrap route is the equivalent of the Next.js `app/auth/bootstrap/` route. It runs after sign-up to ensure the domain user record is created.

### `src/app/routes/auth/bootstrap.tsx`

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getSession } from '@/modules/auth/lib/session';
import { getAppContainer } from '@/core/runtime/bootstrap';
import { PROVISIONING } from '@/core/contracts';
import type { ProvisioningService } from '@/core/contracts/provisioning-access';

const runBootstrap = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const container = getAppContainer();
  const provisioningService = container.resolve<ProvisioningService>(
    PROVISIONING.SERVICE,
  );

  await provisioningService.ensureProvisioned({
    betterAuthId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? undefined,
  });

  return { ok: true };
});

export const Route = createFileRoute('/auth/bootstrap')({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/auth/sign-in' });
    }
  },
  loader: async () => {
    const result = await runBootstrap();
    return result;
  },
  component: BootstrapPage,
});

function BootstrapPage() {
  return (
    <div>
      <p>Setting up your account...</p>
    </div>
  );
}
```

**Flow**:

1. User signs up via `POST /api/auth/sign-up/email`
2. Better Auth redirects to `/auth/bootstrap` (callbackURL)
3. Bootstrap route calls `runBootstrap()` server function
4. `ProvisioningService.ensureProvisioned()` creates domain user record
5. Route redirects to `/app` (or onboarding)

---

## 4. Onboarding Flow

After bootstrap, if `user.onboardingCompleted === false`, the `createSecureServerFn` returns `{ status: 'onboarding_required' }`. The client redirects to `/onboarding`.

```tsx
// src/app/routes/onboarding/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSession } from '@/modules/auth/lib/session';

export const Route = createFileRoute('/onboarding/')({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: '/auth/sign-in' });
  },
  component: OnboardingPage,
});
```

Onboarding completion calls a server function that sets `onboardingCompleted = true`.

---

## 5. Tenancy Provisioning

### Single tenancy (default)

No tenant provisioning needed. All users share the same internal tenant (identified by `DEFAULT_TENANT_ID`).

### Personal tenancy

When `TENANCY_MODE=personal`:

- `ensureProvisioned()` also creates a `tenants` record for the user
- `memberships` record links user to their personal tenant as `owner`

```ts
// Additional logic in ensureProvisioned for personal mode
const [tenant] = await this.db
  .insert(tenants)
  .values({
    name: `${params.name ?? params.email}'s workspace`,
    ownerUserId: user.id,
  })
  .onConflictDoNothing()
  .returning();

await this.db
  .insert(memberships)
  .values({
    userId: user.id,
    tenantId: tenant.id,
    role: 'owner',
  })
  .onConflictDoNothing();
```

### Organization tenancy (`TENANCY_MODE=org`)

Organization creation is a separate flow (not part of initial bootstrap). Users are invited to organizations. Membership provisioning is handled by a separate admin flow.

---

## 6. Role/Permission Seeding

Default roles and permissions must be seeded before first authorization check. This runs as part of the provisioning bootstrap or as a DB migration step.

```ts
// src/modules/provisioning/infrastructure/drizzle/seedDefaultRoles.ts
export async function seedDefaultRoles(db: DrizzleDb) {
  const defaultRoles = [
    {
      name: 'admin',
      permissions: [
        'user:read',
        'user:write',
        'user:delete',
        'admin-panel:access',
      ],
    },
    {
      name: 'member',
      permissions: ['user:read', 'settings:read', 'settings:write'],
    },
    { name: 'viewer', permissions: ['user:read'] },
  ];

  for (const role of defaultRoles) {
    await db.insert(roles).values({ name: role.name }).onConflictDoNothing();
    // ... insert permissions and role_permissions
  }
}
```

This is called at startup (not per-request) via the composition root or a migration step.

---

## 7. Deleted Components

| Deleted                                                       | Why                                            |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `auth_user_identities` schema/table                           | Not needed – Better Auth ID is stored directly |
| `auth_tenant_identities` schema/table                         | Not needed – Better Auth manages identity      |
| `DrizzleInternalIdentityLookup` complex multi-provider lookup | Simplified to `findByBetterAuthId`             |
| `OrgProviderTenantResolver`                                   | Clerk Organizations-specific                   |
| `crossProviderEmailLinking` logic                             | Clerk-specific concept                         |
| `ExternalAuthProvider` type in contracts                      | Clerk-specific abstraction                     |

---

## Risks

| Risk                                                                            | Severity | Mitigation                                                              |
| ------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| Bootstrap route called multiple times (e.g., page refresh) – must be idempotent | CRITICAL | Use `INSERT ... ON CONFLICT DO NOTHING` or explicit existence check     |
| Bootstrap race condition: two simultaneous requests for same new user           | MAJOR    | DB-level unique constraint on `users.betterAuthId` prevents duplicates  |
| Personal tenant provisioning failure leaves user without tenant                 | MAJOR    | Wrap in DB transaction; if tenant insert fails, roll back user creation |
| `checkReadiness` called per server function invocation – adds DB query per call | MINOR    | Cache readiness result in session/cookie for short duration             |
| Role seeding must complete before first user login                              | MAJOR    | Run as DB migration step (not at runtime)                               |

---

## Validation

Phase 7 is complete when:

- [ ] New user sign-up → bootstrap route → domain `users` record created
- [ ] Second bootstrap call for same user is idempotent (no duplicate user)
- [ ] `checkReadiness` returns `BOOTSTRAP_REQUIRED` before bootstrap
- [ ] `checkReadiness` returns `ONBOARDING_REQUIRED` after bootstrap, before onboarding
- [ ] `checkReadiness` returns `READY` after onboarding completed
- [ ] `createSecureServerFn` correctly maps readiness status to response shape
- [ ] Unit test: `DrizzleProvisioningService.ensureProvisioned()` idempotent
- [ ] Unit test: `DrizzleProvisioningService.checkReadiness()` returns correct status
- [ ] Integration test: full sign-up → bootstrap → first server function call flow
- [ ] `pnpm typecheck` passes
