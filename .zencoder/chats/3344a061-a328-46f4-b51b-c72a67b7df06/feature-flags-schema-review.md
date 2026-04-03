# Feature Flags Schema Design Review

**Status**: DRAFT — Awaiting user decision before any implementation

---

## What Went Wrong (Guard Failure Admission)

The Architecture Guard jumped to implementation (UUID → TEXT) without first tracing the full identity and tenancy chain. That was a failure of the guard role. This document is the investigation that should have happened first.

---

## 1. The Full Identity Mapping Chain (Traced from Code)

### External to Internal Resolution

```
Clerk (org_xxx)
    ↓  stored as external_tenant_id (TEXT) in auth_tenant_identities
    ↓  mapped to tenant_id (UUID) in auth_tenant_identities
    ↓  this is the internal UUID from tenants.id
    ↓
TenantContext.tenantId = internal UUID (e.g. "a1b2c3d4-...")
    ↓
AuthorizationContext.tenant.tenantId = same internal UUID
```

**Files verified**:

- `src/modules/auth/infrastructure/drizzle/schema.ts` — `auth_tenant_identities`: `external_tenant_id TEXT`, `tenant_id UUID → tenants.id`
- `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.ts` — `findInternalTenantId()` returns a UUID string
- `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts` — `deterministicTenantId()` generates a UUID-shaped hash; `tenants.id` is inserted as UUID
- `src/core/contracts/primitives.ts` — `TenantId = string` (loose type alias)
- `src/core/contracts/tenancy.ts` — `TenantContext.tenantId: TenantId`
- `src/core/contracts/identity.ts` — Invariant comment: `identity.id` is always an internal UUID in Node paths

### Key invariant (real production flows)

> In any authenticated request that went through the bootstrap path, `AuthorizationContext.tenant.tenantId` is always a valid UUID string from `tenants.id`.

---

## 2. The Current feature_flags Schema

```typescript
// src/modules/feature-flags/infrastructure/drizzle/schema.ts
export const featureFlagsTable = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  tenantId: uuid('tenant_id'),          // ← UUID type, NO FK constraint
  ...
});
```

**Critical observation**: `tenant_id` is `uuid` type but has **no foreign key** to `tenants.id`.

This is an inconsistent design:

- UUID type → enforces UUID parsing at Postgres level (raises 22P02 on non-UUID input)
- No FK → provides zero referential integrity (a deleted tenant's flags are not cleaned up)
- Result: all the cost of UUID validation, none of the benefit of relational integrity

---

## 3. The Actual Postgres Error

```
22P02: invalid input syntax for type uuid
WHERE: unnamed portal parameter $2 = '...'
```

The query:

```sql
SELECT enabled, tenant_id
FROM feature_flags
WHERE key = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
params: ["demo.new-dashboard-ui", "demo"]
```

Postgres rejects this at **parameter binding time**, before evaluating any rows. Even though the intended fallback `OR tenant_id IS NULL` would have returned a result, the entire query fails because `'demo'` cannot be cast to `uuid`.

**The demo page creates a synthetic context**:

```typescript
const demoAuthContext: AuthorizationContext = {
  tenant: { tenantId: 'demo' },  // ← NOT a UUID — violates the runtime invariant
  ...
};
```

---

## 4. Design Options

### Option A — Keep UUID, add missing FK to tenants.id

```sql
ALTER TABLE feature_flags ADD CONSTRAINT fk_feature_flags_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
```

**Meaning**: Feature flags may ONLY be scoped to provisioned tenants. A tenant must exist in `tenants` before a tenant-scoped flag can be created.

**Pros**:

- Aligns with real production flows (tenant IDs are always UUIDs from `tenants.id`)
- Adds missing referential integrity (tenant deletion cascades to its flags)
- Enforces that flags are tied to a real provisioned entity

**Cons**:

- Cannot store pre-provisioning flags for a tenant
- Cannot scope flags to external/synthetic contexts (demo, test, GrowthBook-only attributes)
- The demo page is **architecturally wrong** with this model — it needs a real provisioned tenant UUID
- GrowthBook's string-based company ID cannot be used for tenant scoping without UUID resolution

**Demo page fix required**: Either (a) remove the DB adapter from the demo entirely (use static), or (b) seed a `demo` tenant in `tenants` with a known UUID and use that UUID in the demo context.

---

### Option B — Keep UUID, no FK (current state = status quo)

Do nothing to the schema. Only fix the demo page to either:

- Use `FEATURE_FLAG_PROVIDER=static` (which ignores tenant context entirely)
- Use a UUID-shaped string as the demo tenant ID (e.g. a hardcoded demo UUID)

**Meaning**: UUID type provides DB-level UUID validation. No referential integrity. Any UUID-shaped string (real or synthetic) works.

**Pros**: No migration needed. Real flows already work correctly.

**Cons**: UUID type without FK is inconsistent. The schema says "this looks like a UUID FK" but isn't. Misleading. Still doesn't support pre-provisioning or non-UUID-scope flags.

---

### Option C — Change to TEXT, no FK

```typescript
tenantId: text('tenant_id'),
```

**Meaning**: Feature flags can be scoped to any string identifier — internal UUIDs, Clerk org IDs, string slugs, demo keys, external service identifiers.

**Pros**:

- Aligns with `TenantId = string` contract (which is intentionally loose)
- Works with all adapters including GrowthBook (string-based attributes)
- Allows pre-provisioning flags and demo/test contexts
- Demo page works without a seeded tenant
- Future-proof for non-UUID tenant models

**Cons**:

- Loses UUID validation (non-UUID strings accepted without error)
- Real production flows pass UUIDs — TEXT doesn't prevent passing the wrong string by accident
- No referential integrity (same as current, but now you can't even enforce UUID format)

**Migration required**: `ALTER TABLE feature_flags ALTER COLUMN tenant_id TYPE text;`

---

### Option D — Change to TEXT, keep internal UUID convention documented

Same as Option C but with an explicit code comment + ADR stating:

> In production flows, `tenant_id` values are always internal UUIDs from `tenants.id`. TEXT is used because: (1) no FK is needed (flags outlive tenant provisioning), (2) adapters other than Drizzle use string contexts, (3) the contract is `TenantId = string`.

---

## 5. Architecture Guard Assessment

### What the schema should be

The absence of a FK in the current schema is a meaningful signal: **feature flags were intentionally designed to be loosely coupled from the tenancy system**.

Evidence:

1. No FK exists → deliberate or forgotten?  
   Given the careful design of the rest of the provisioning module (explicit FK everywhere else), the absence here is notable.
2. GrowthBook adapter receives `context.tenant.tenantId` and passes it as a string attribute. It does not need a UUID.
3. Static adapter ignores tenant context entirely.
4. The migration scripts insert flags with `tenantId: null` (global) by design.
5. `TenantId = string` is the contract type — not `UUID`.

### The inconsistency risk of keeping UUID without FK

If UUID type is kept WITHOUT FK, it means:

- A flag for a deleted tenant remains in the table (orphaned — no cascade)
- The schema implies UUID meaning but provides no enforcement

This is the worst design: UUID parsing overhead + zero relational guarantees.

### Recommended design

**Option C (TEXT, no FK)** — but with an important constraint:

The `DrizzleFeatureFlagService` must document that in production use, `tenant_id` values will be internal UUIDs. The schema change is not permission to use arbitrary strings in production — the runtime invariant is preserved by the provisioning flow.

**The demo page** stays as-is conceptually (synthetic context is fine for demo purposes), because the DB adapter with `tenantId: 'demo'` will simply find no tenant-scoped row and fall back to the global flag (tenantId = null). That is correct behavior.

### Why not Option A (UUID + FK)?

Adding FK now would be a breaking change to the intended loose-coupling design. It would mean:

- Demo page requires a seeded tenant with a real UUID
- Pre-provisioning flags cannot exist
- GrowthBook integration cannot store tenant-specific flags without first resolving a UUID
- The boilerplate becomes more rigid without clear benefit

If this codebase is ever evolved to require strict tenant-scoped flag governance, the FK can be added then — when there is a clear need.

---

## 6. The Demo Page Bug — Root Cause

The demo page constructs `tenantId: 'demo'` which hits the DB adapter when `FEATURE_FLAG_PROVIDER=db`. The result depends on schema type:

| Schema type    | `'demo'` passed as tenant_id                                                        | Result                                                        |
| -------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| UUID (current) | Postgres raises 22P02 — query fails entirely                                        | Error caught by `ResilientFeatureFlagService`, flag = `false` |
| TEXT           | Postgres accepts the value, finds no matching row, falls back to global (null) flag | Returns the global flag value correctly                       |

With TEXT schema: the demo page would correctly display the 3 flags (which were migrated as global, `tenantId=null`), because the fallback path works.

With UUID schema (after keeping it): the demo page MUST use a real UUID or use `FEATURE_FLAG_PROVIDER=static` to avoid the error.

---

## 7. What Needs Fixing in Agent Prompts

The Architecture Guard missed this because the prompt does not require:

1. **Tracing the full identity/tenancy chain before reviewing schema decisions** — When any module touches `tenant_id`, the guard must trace: Clerk → external ID → internal UUID mapping → what value is in `AuthorizationContext` at runtime.

2. **Checking for FK consistency** — UUID column without FK is a red flag that must be called out explicitly before recommending type changes.

3. **Checking all adapters** — A schema change that fixes one adapter (Drizzle) must be evaluated against all adapters (GrowthBook, static, in-memory) and their tenant context handling.

4. **Pre-implementation check rule** — Any schema change (column type, FK, index) must produce a review document before generating migration. No exceptions.

---

## 8. Required User Decision

Please choose one of the following:

**[ ] Decision A — UUID + FK (tight coupling)**  
Add FK to `tenants.id`. Feature flags are tenant-lifecycle managed. Demo page uses static provider.

**[ ] Decision B — UUID, no FK (status quo)**  
Keep schema, only fix demo page to use static provider or a UUID-shaped demo tenant ID.

**[ ] Decision C — TEXT, no FK (loose coupling, recommended)**  
Change column to text. Allows any string scope. Demo page works correctly. Requires migration.

**[ ] Decision D — TEXT, no FK + documented convention**  
Same as C, plus ADR noting that production values will always be UUIDs from `tenants.id`.

---

## 9. Files That Will Change (pending decision)

| File                                                                                 | Change (if C or D chosen)                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `src/modules/feature-flags/infrastructure/drizzle/schema.ts`                         | `uuid('tenant_id')` → `text('tenant_id')`, remove unused `uuid` import |
| `src/core/db/migrations/generated/NNNN_*.sql`                                        | `ALTER COLUMN tenant_id TYPE text`                                     |
| `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagService.test.ts` | No change needed — tests already use string tenant IDs                 |
| Architecture Guard prompt                                                            | Add pre-implementation identity chain tracing rule                     |
| AGENTS.md                                                                            | Add schema type discipline rule                                        |
