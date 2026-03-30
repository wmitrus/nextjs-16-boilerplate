## Structure

```bash
src/core/db/seed.ts
scripts/db-seed.ts
src/modules/authorization/infrastructure/drizzle/seed.ts
src/modules/billing/infrastructure/drizzle/seed.ts
src/modules/user/infrastructure/drizzle/seed.ts
```

## Seed per tenant:

```bash
await db.insert(tenants).values({ id: 't1', name: 'Acme' });

await db.insert(users).values({ tenantId: 't1', ... });

await db.insert(roles).values({ tenantId: 't1', name: 'admin' });
```

- Every seed must have a tenantId.
- Never a global user without a tenantId.
