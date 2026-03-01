```ts
export async function seedDev(db: DrizzleDb) {
  const tenantId = 't_dev_1';

  await db.insert(tenants).values({
    id: tenantId,
    name: 'Dev Tenant',
  });

  await db.insert(users).values({
    id: 'u_dev_admin',
    email: 'admin@dev.local',
  });

  await db.insert(memberships).values({
    tenantId,
    userId: 'u_dev_admin',
    role: 'admin',
  });

  await db.insert(plans).values({
    id: 'starter',
    name: 'Starter Plan',
  });

  await db.insert(subscriptions).values({
    tenantId,
    planId: 'starter',
    status: 'active',
  });
}
```
