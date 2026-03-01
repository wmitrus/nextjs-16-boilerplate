## Structure

```bash
core/db/seed/
  seed-dev.ts
  seed-test.ts
  seed-factory.ts
```

## Seed per tenant:

```bash
await db.insert(tenants).values({ id: 't1', name: 'Acme' });

await db.insert(users).values({ tenantId: 't1', ... });

await db.insert(roles).values({ tenantId: 't1', name: 'admin' });
```

- Every seed must have a tenantId.
- Never a global user without a tenantId.
