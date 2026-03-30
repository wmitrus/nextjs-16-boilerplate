# Seed structure (spec)

> This is critical:

### Seed must

- create a tenant
- create a membership
- create permissions and roles for the tenant.
- It should also create default policies.
- Optionally, it can create plans/subscriptions. - must have for tests

For test scenarios that validate billing or limits, include plans/subscriptions.

## Directory structure

```bash
src/core/db/seed.ts
scripts/db-seed.ts
src/modules/authorization/infrastructure/drizzle/seed.ts
src/modules/billing/infrastructure/drizzle/seed.ts
src/modules/user/infrastructure/drizzle/seed.ts
```
