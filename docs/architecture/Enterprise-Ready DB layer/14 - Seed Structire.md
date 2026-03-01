## Spec:

> This is critical:

### Seed must

- create a tenant
- create a membership
- create permissions and roles for the tenant.
- It should also create default policies.
- Optionally, it can create plans/subscriptions. - must have for tests

## Directory structure

```bash
core/db/seed/
  seed-dev.ts
  seed-test.ts
  factories/
    tenant.factory.ts
    user.factory.ts
    role.factory.ts
```
