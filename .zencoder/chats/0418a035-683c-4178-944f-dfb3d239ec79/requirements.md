# Product Requirements Document

## Enterprise-Ready Multi-Tenant SaaS Infrastructure

**Feature**: Full Multi-Tenant SaaS Architecture with RBAC/ABAC, Identity Abstraction, Drizzle Persistence, Feature Flags, and Billing Hooks

---

## 1. Context & Background

The codebase already has a partial foundation:

- **Identity contracts**: `RequestIdentitySource`, `IdentityProvider` in `src/core/contracts/identity.ts`
- **Authorization contracts**: `AuthorizationContext`, `AuthorizationService`, repository ports in `src/core/contracts/`
- **Clerk adapter**: `ClerkRequestIdentitySource`, `RequestScopedIdentityProvider`, `RequestScopedTenantResolver`
- **In-memory repos**: Permissive stubs that throw in production
- **Domain**: `DefaultAuthorizationService`, `PolicyEngine`, `ConditionEvaluator`
- **Container**: Simple DI container with `authModule` + `authorizationModule` registered

**Gap**: No real persistence (Drizzle), no feature flag service, no billing module, no enterprise contracts, no SystemIdentitySource for background jobs.

---

## 2. Goals

1. Replace all InMemory repositories with Drizzle-backed production implementations.
2. Finalize Identity Axis: add `SystemIdentitySource` for background jobs; keep `ClerkRequestIdentitySource`; prepare placeholders for AuthJS/Supabase.
3. Design and migrate a production-grade multi-tenant DB schema (PostgreSQL via Drizzle).
4. Implement all domain repository contracts using Drizzle.
5. Introduce `FeatureFlagService` contract + `InMemoryFeatureFlagService` (test) + placeholder for OpenFeature.
6. Add Billing module skeleton (Stripe-ready, writes `tenant_attributes`).
7. Add Enterprise contract support through `tenant_attributes.contract_type`.
8. Keep architecture strictly compliant with the 3-axis isolation model.

---

## 3. Non-Goals (Out of Scope for this Feature)

- Prisma adapter (documented as future work, not built now)
- Live Stripe webhook implementation (schema + skeleton only)
- OpenFeature adapter (contract + InMemory only in this phase)
- UI for tenant/role/policy management
- AuthJS or Supabase adapters (placeholders prepared, not implemented)

---

## 4. Architecture Constraints (Hard Rules)

| Rule                        | Description                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| **Domain isolation**        | Domain (`src/modules/*/domain/`) MUST NOT import ORM, OpenFeature, Clerk, env, or logger      |
| **Repository boundary**     | Repositories MUST NOT return ORM types; always map to domain types                            |
| **Repository purity**       | Repositories MUST NOT make business decisions                                                 |
| **AuthorizationService**    | MUST NOT know about Stripe, OpenFeature, or ORM                                               |
| **TenantResolver**          | MUST NOT depend on ORM directly                                                               |
| **Billing → Authorization** | Billing writes `tenant_attributes` to DB; Authorization reads from DB. Never direct coupling. |
| **InMemory in production**  | MUST throw if `NODE_ENV=production` and `DB_PROVIDER != drizzle`                              |

---

## 5. Identity Axis (Axis 1)

### 5.1 Contracts (existing, validated)

- `RequestIdentitySource` — raw provider data
- `IdentityProvider` — resolved `Identity | null`

### 5.2 Adapters Required

| Adapter                         | Path                                    | Status             |
| ------------------------------- | --------------------------------------- | ------------------ |
| `ClerkRequestIdentitySource`    | `modules/auth/infrastructure/clerk/`    | Exists (relocate)  |
| `AuthJsRequestIdentitySource`   | `modules/auth/infrastructure/authjs/`   | Placeholder only   |
| `SupabaseRequestIdentitySource` | `modules/auth/infrastructure/supabase/` | Placeholder only   |
| `SystemIdentitySource`          | `modules/auth/infrastructure/system/`   | **New — required** |

### 5.3 SystemIdentitySource

```
userId = "system"
orgId = "system"
email = undefined
```

Used by cron jobs and background workers. Does NOT call Clerk.

### 5.4 Composition Root

`AUTH_PROVIDER` env variable controls which adapter is injected into the container. Default: `clerk`.

---

## 6. Persistence Axis (Axis 2) — DB Schema

### 6.1 Database

- PostgreSQL
- ORM: Drizzle ORM
- ID strategy: UUID (`crypto.randomUUID()`)
- All timestamps: `timestamp with time zone`
- JSON columns: `jsonb`

### 6.2 Tables

#### `users`

| Column       | Type                 | Notes         |
| ------------ | -------------------- | ------------- |
| `id`         | uuid PK              |               |
| `email`      | text UNIQUE NOT NULL |               |
| `created_at` | timestamptz          | DEFAULT now() |

Index: `idx_users_email ON users(email)`

#### `tenants`

| Column       | Type          | Notes         |
| ------------ | ------------- | ------------- |
| `id`         | uuid PK       |               |
| `name`       | text NOT NULL |               |
| `created_at` | timestamptz   | DEFAULT now() |

#### `roles`

| Column       | Type                                    | Notes         |
| ------------ | --------------------------------------- | ------------- |
| `id`         | uuid PK                                 |               |
| `tenant_id`  | uuid FK → tenants(id) ON DELETE CASCADE |               |
| `name`       | text NOT NULL                           |               |
| `is_system`  | boolean                                 | DEFAULT false |
| `created_at` | timestamptz                             | DEFAULT now() |

Constraint: `UNIQUE (tenant_id, name)`
Index: `idx_roles_tenant ON roles(tenant_id)`

#### `memberships`

| Column       | Type                                    | Notes         |
| ------------ | --------------------------------------- | ------------- |
| `user_id`    | uuid FK → users(id) ON DELETE CASCADE   |               |
| `tenant_id`  | uuid FK → tenants(id) ON DELETE CASCADE |               |
| `role_id`    | uuid FK → roles(id) ON DELETE RESTRICT  |               |
| `created_at` | timestamptz                             | DEFAULT now() |

PK: `(user_id, tenant_id)`
Indexes: `(tenant_id, user_id)`, `(user_id)`

#### `policies`

| Column       | Type                                    | Notes                     |
| ------------ | --------------------------------------- | ------------------------- |
| `id`         | uuid PK                                 |                           |
| `tenant_id`  | uuid FK → tenants(id) ON DELETE CASCADE | NULLABLE (global)         |
| `role_id`    | uuid FK → roles(id) ON DELETE CASCADE   | NULLABLE (tenant-wide)    |
| `effect`     | text CHECK ('allow' \| 'deny') NOT NULL |                           |
| `resource`   | text NOT NULL                           |                           |
| `actions`    | jsonb NOT NULL                          | Array of strings          |
| `conditions` | jsonb                                   | ABAC conditions, nullable |
| `created_at` | timestamptz                             | DEFAULT now()             |

Indexes: `(tenant_id)`, `(role_id)`, `(resource)`

#### `tenant_attributes`

| Column          | Type                                       | Notes              |
| --------------- | ------------------------------------------ | ------------------ |
| `tenant_id`     | uuid PK FK → tenants(id) ON DELETE CASCADE |                    |
| `plan`          | text NOT NULL                              |                    |
| `contract_type` | `contract_type` enum                       | DEFAULT 'standard' |
| `features`      | jsonb                                      | DEFAULT '[]'       |
| `max_users`     | integer                                    | DEFAULT 5          |
| `created_at`    | timestamptz                                | DEFAULT now()      |
| `updated_at`    | timestamptz                                | DEFAULT now()      |

Index: `idx_tenant_attributes_plan ON tenant_attributes(plan)`

#### `subscriptions`

| Column                     | Type                                    | Notes         |
| -------------------------- | --------------------------------------- | ------------- |
| `id`                       | uuid PK                                 |               |
| `tenant_id`                | uuid FK → tenants(id) ON DELETE CASCADE |               |
| `provider`                 | text NOT NULL                           | e.g. 'stripe' |
| `provider_subscription_id` | text NOT NULL                           |               |
| `status`                   | `subscription_status` enum NOT NULL     |               |
| `current_period_end`       | timestamptz                             | NULLABLE      |
| `created_at`               | timestamptz                             | DEFAULT now() |

Constraint: `UNIQUE (provider, provider_subscription_id)`
Indexes: `(tenant_id)`, `(status)`

### 6.3 Enums

```sql
CREATE TYPE subscription_status AS ENUM (
  'incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'
);

CREATE TYPE contract_type AS ENUM (
  'standard', 'enterprise'
);
```

### 6.4 Multi-Tenant Integrity (Application-enforced)

- `memberships.role_id` MUST belong to same `tenant_id` as `memberships.tenant_id` — validated at application level
- `policies.role_id` MUST belong to same `tenant_id` — validated at application level

---

## 7. Drizzle Integration

### 7.1 Structure

```
src/modules/authorization/infrastructure/drizzle/
  schema.ts                      ← Drizzle table definitions
  DrizzleRoleRepository.ts
  DrizzleMembershipRepository.ts
  DrizzlePolicyRepository.ts
  DrizzleTenantAttributesRepository.ts
```

### 7.2 Rules

- Drizzle schema ONLY in `infrastructure/drizzle/`
- Schema NOT exported to domain
- DB records MUST be mapped to domain types before returning

### 7.3 Container wiring

```
if DB_PROVIDER=drizzle → registerDrizzleRepositories()
```

---

## 8. Feature Flag Axis (Axis 3)

### 8.1 Contract

```typescript
export interface FeatureFlagService {
  isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>;
}
```

Location: `src/core/contracts/feature-flags.ts`

### 8.2 Domain usage

`AuthorizationService` may optionally accept `FeatureFlagService`. Feature flags are **additional conditions**, NOT policy replacements.

### 8.3 Adapters

| Adapter                         | Path                                                | Status               |
| ------------------------------- | --------------------------------------------------- | -------------------- |
| `InMemoryFeatureFlagService`    | `modules/feature-flags/infrastructure/memory/`      | **New — for tests**  |
| `OpenFeatureFeatureFlagService` | `modules/feature-flags/infrastructure/openfeature/` | **Placeholder only** |

---

## 9. Billing Module

### 9.1 Structure

```
src/modules/billing/
  domain/
    BillingService.ts            ← interface only
    SubscriptionStatus.ts        ← domain enum/type
  infrastructure/
    stripe/
      StripeBillingService.ts    ← placeholder (webhook handler structure)
  index.ts
```

### 9.2 Invariant

- Billing WRITES to `subscriptions` and `tenant_attributes` in DB
- Authorization READS from `tenant_attributes` — never calls Stripe
- No direct coupling between billing and authorization

---

## 10. Enterprise Contracts

- Enterprise data lives in `tenant_attributes.contract_type = 'enterprise'`
- Policies can condition on: `context.tenantAttributes.contractType === 'enterprise'`
- No separate security engine required
- Checked via existing ABAC `ConditionEvaluator` mechanism

---

## 11. Environment Variables Required

| Variable        | Type                                | Description                   |
| --------------- | ----------------------------------- | ----------------------------- |
| `DATABASE_URL`  | string                              | PostgreSQL connection string  |
| `DB_PROVIDER`   | `'drizzle'`                         | Persistence provider selector |
| `AUTH_PROVIDER` | `'clerk' \| 'authjs' \| 'supabase'` | Identity adapter selector     |

---

## 12. Removal Phase

After Drizzle repositories are working:

1. Remove `InMemoryRoleRepository`, `InMemoryPolicyRepository`, `InMemoryMembershipRepository`, `InMemoryTenantAttributesRepository`
2. Keep `MockRepositories` (test only)
3. In production: throw if `DB_PROVIDER` is not `drizzle`

---

## 13. Delivery Phases

| Phase       | Description                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------- |
| **Phase 1** | Identity Axis finalization (SystemIdentitySource, AUTH_PROVIDER env, relocate Clerk adapter) |
| **Phase 2** | DB schema — Drizzle table definitions + migrations                                           |
| **Phase 3** | Drizzle repository implementations                                                           |
| **Phase 4** | Container wiring (DB_PROVIDER switch), remove InMemory                                       |
| **Phase 5** | FeatureFlagService contract + InMemoryFeatureFlagService                                     |
| **Phase 6** | Billing module skeleton                                                                      |
| **Phase 7** | OpenFeature placeholder adapter                                                              |
| **Phase 8** | Env vars (DATABASE_URL, DB_PROVIDER, AUTH_PROVIDER) + .env.example update                    |
| **Phase 9** | Typecheck + lint verification                                                                |

---

## 14. Assumptions Made

1. **PostgreSQL** is the only DB target; Prisma adapter deferred.
2. **Clerk** remains the active identity provider; other adapters are placeholders.
3. **Stripe** webhook handler is out of scope; only DB schema + service interface.
4. **OpenFeature** adapter is out of scope; only contract + InMemory test adapter.
5. Drizzle migrations will be generated via `drizzle-kit` (to be installed).
6. `DB_PROVIDER` env defaults to `'drizzle'`; validation throws in production if missing.
7. Feature flags are an **additive condition** on policies, not a replacement.
