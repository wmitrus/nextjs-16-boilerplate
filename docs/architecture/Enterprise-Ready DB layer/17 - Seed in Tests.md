## W testach:

- create a tenant for each test
- don't use constant IDs
- rollback after the test

## Factory:

```ts
export function createTenantFactory(db: DrizzleDb) {
  return async function createTenant(data?) {
    const id = crypto.randomUUID();
    await db.insert(tenants).values({ id, ...data });
    return id;
  };
}
```

## Most important rules

❌ Never have a global user without tenantId.
❌ Never have global roles (except system ones).
❌ Never use seed in production runtime.
❌ Do not use seed to migrate data from production.
✅ Use seed only for development and testing.

## Perfect SaaS Model for Seeds

Every tenant has its own:

- roles
- feature flags
- subscription
- membership

It allows you to have:

- custom roles per tenant
- enterprise contracts
- plan-based feature gating
