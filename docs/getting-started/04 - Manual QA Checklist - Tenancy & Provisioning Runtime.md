# Manual QA Checklist - Tenancy & Provisioning Runtime

This checklist is for real runtime verification after the provisioning/tenancy refactor.

Use it to validate behavior for:

- tenants
- organizations
- roles (`owner`/`member`)
- onboarding + provisioning

## 0. Pre-flight (run once)

1. Set baseline env (start with single profile):

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=single
DEFAULT_TENANT_ID=10000000-0000-0000-0000-000000000001

DB_PROVIDER=drizzle
DB_DRIVER=pglite
DATABASE_URL=file:./data/pglite
```

2. Start clean runtime:

```bash
pnpm env:check
pnpm db:migrate:dev
pnpm db:seed
pnpm dev
```

3. Use a fresh browser profile/incognito for each scenario.

## 1. Shared quick probes

### 1.1 Unauthenticated API probe

```bash
curl -i http://localhost:3000/api/users
```

Expected:

- HTTP `401`
- body contains code `UNAUTHORIZED`

### 1.2 Browser authenticated API probe

After signing in, run in browser console:

```js
fetch('/api/users')
  .then(async (r) => ({ status: r.status, body: await r.json() }))
  .then(console.log);
```

Expected (happy path):

- status `200`
- users payload

## 2. Scenario A - Single Tenant (no Clerk org required)

Profile:

```dotenv
TENANCY_MODE=single
DEFAULT_TENANT_ID=10000000-0000-0000-0000-000000000001
```

Checklist:

- [ ] Sign in with Clerk user that has no organization.
- [ ] If redirected to onboarding, submit onboarding form successfully.
- [ ] Open `/users` -> page loads (no redirect loop).
- [ ] Open `/security-showcase` -> submit **Update Settings**.

Expected:

- onboarding completes
- secure action result contains success
- no tenant-context errors

## 3. Scenario B - Personal Tenant (tenant per user)

Profile:

```dotenv
TENANCY_MODE=personal
```

Checklist:

- [ ] Restart app after env change.
- [ ] Sign in (same or new Clerk user).
- [ ] Complete onboarding.
- [ ] Open `/users` and `/security-showcase`.

Expected:

- personal tenant is provisioned
- secure action succeeds
- no org is required

## 4. Scenario C - Org via Provider (Clerk Organizations)

Profile:

```dotenv
TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=provider
```

### 4.1 Negative path (missing org context)

Checklist:

- [ ] Sign in user with no active organization in session.
- [ ] Open `/users`.

Expected:

- redirect to `/onboarding?reason=tenant-context-required`

API check (same logged-in session):

```js
fetch('/api/users')
  .then(async (r) => ({ status: r.status, body: await r.json() }))
  .then(console.log);
```

Expected:

- status `409`
- code `TENANT_CONTEXT_REQUIRED`

### 4.2 Positive path (active org context)

Clerk setup:

1. Enable Organizations.
2. Create organization.
3. Add test user to organization.
4. Ensure this org is active in current session.

Checklist:

- [ ] Sign in with active org session.
- [ ] Complete onboarding.
- [ ] Open `/users`.
- [ ] Run secure action in `/security-showcase`.

Expected:

- onboarding provisioning succeeds
- no tenant-context errors
- protected routes/actions work

## 5. Scenario D - Org via DB Context

Profile:

```dotenv
TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=db
TENANT_CONTEXT_HEADER=x-tenant-id
TENANT_CONTEXT_COOKIE=active_tenant_id
```

### 5.1 Missing active tenant

Checklist:

- [ ] Clear cookie:

```js
document.cookie = 'active_tenant_id=; Max-Age=0; path=/';
```

- [ ] Open `/users`.

Expected:

- redirect to `/onboarding?reason=tenant-context-required`

API expected:

- `409` + `TENANT_CONTEXT_REQUIRED`

### 5.2 Active tenant but no membership

Set non-member tenant in cookie:

```js
document.cookie =
  'active_tenant_id=10000000-0000-0000-0000-000000000002; path=/';
```

Run:

```js
fetch('/api/users')
  .then(async (r) => ({ status: r.status, body: await r.json() }))
  .then(console.log);
```

Expected:

- status `403`
- code `TENANT_MEMBERSHIP_REQUIRED`

### 5.3 Active tenant with membership (success)

Use tenant where your user already has membership.

If you first completed Scenario A, use:

```js
document.cookie =
  'active_tenant_id=10000000-0000-0000-0000-000000000001; path=/';
```

Then test:

- [ ] `/users` loads
- [ ] `/security-showcase` secure action succeeds

## 6. Role Mapping Checks (owner/member)

Applies mainly to `TENANT_CONTEXT_SOURCE=provider`.

Rule under test:

- provider role claim containing `admin` or `owner` -> internal role `owner`
- otherwise -> `member`

Optional DB verification (Drizzle Studio SQL):

```sql
-- 1) find internal user by provider external user id
select * from auth_user_identities;

-- 2) find tenant mapping
select * from auth_tenant_identities;

-- 3) verify membership role names
select m.user_id, m.tenant_id, r.name as role_name
from memberships m
join roles r on r.id = m.role_id;
```

Expected:

- role names are only `owner` or `member`

## 7. Onboarding Assertions

For every successful first login in each scenario:

- [ ] onboarding form submit returns success
- [ ] next request is not redirected back to onboarding
- [ ] `/users` and secure action are usable

If onboarding fails, expected controlled error strings include:

- `Provisioning failed. Please try again.`
- `Missing required fields`

## 8. Known Limits in current runtime

- `AUTH_PROVIDER=authjs` and `AUTH_PROVIDER=supabase` are not yet runtime-complete.
- Identity source adapters for those providers currently return no authenticated identity.

Do not treat those two provider runtime failures as tenancy/provisioning regressions yet.

## 9. Pass Criteria

Checklist is PASS when:

1. All positive-path scenarios succeed (`single`, `personal`, `org/provider`, `org/db`).
2. All negative-path scenarios return controlled responses (401/403/409 or onboarding redirect).
3. No unhandled runtime exceptions appear in terminal for tested flows.

## 10. Related Docs

- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
- `docs/features/ENV-requirements.md`
- `docs/features/15 - Clerk Authentication.md`
- `docs/features/17 - Clerk Onboarding.md`
