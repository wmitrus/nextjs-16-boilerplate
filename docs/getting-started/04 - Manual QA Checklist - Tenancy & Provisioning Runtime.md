# Manual QA Checklist - Tenancy & Provisioning Runtime

This checklist validates real runtime behavior after the provisioning/tenancy refactor.

Scope:

- tenants
- organizations
- roles (`owner`/`member`)
- onboarding + provisioning

## 0. Pre-flight (run once)

### 0.1 Execution model (authoritative)

Use **chained mode** for this checklist.

- one DB state for the full run
- one browser session
- fixed order: `A -> B -> C -> D`

This matches `05 - One-Page Runtime Execution Sheet`.

### 0.2 Baseline env

```dotenv
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=single
DEFAULT_TENANT_ID=10000000-0000-4000-8000-000000000001

DB_PROVIDER=drizzle
DB_DRIVER=pglite
DATABASE_URL=file:./data/pglite
```

### 0.3 Start runtime

```bash
pnpm env:check
pnpm db:migrate:dev
pnpm db:seed
pnpm dev
```

## 1. Shared probes

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
fetch('/api/me/provisioning-status')
  .then(async (r) => ({ status: r.status, body: await r.json() }))
  .then(console.log);
```

Expected (happy path):

- status `200`
- payload contains `internalUserId`, `internalTenantId`, `onboardingComplete`, `tenancyMode`

### 1.3 Optional domain probe

```js
fetch('/api/users')
  .then(async (r) => ({ status: r.status, body: await r.json() }))
  .then(console.log);
```

Expected:

- same auth/provisioning semantics as probe endpoint
- for happy path: status `200`

## 2. Scenario A - Single Tenant (no Clerk org required)

Profile:

```dotenv
TENANCY_MODE=single
DEFAULT_TENANT_ID=10000000-0000-4000-8000-000000000001
```

Checklist:

- [ ] Sign in with Clerk user that has no organization.
- [ ] If redirected to onboarding, submit onboarding form successfully.
- [ ] Open `/users` (no redirect loop).
- [ ] Run browser authenticated provisioning probe (`/api/me/provisioning-status`) and expect `200`.
- [ ] Run browser domain probe (`/api/users`) and expect `200`.
- [ ] Optional diagnostic: run Update Settings in `/security-showcase` (controlled result, no crash).

Expected:

- onboarding completes
- tenancy context resolves
- `/api/users` returns `200`

## 3. Scenario B - Personal Tenant (tenant per user)

Profile:

```dotenv
TENANCY_MODE=personal
```

Checklist:

- [ ] Restart app after env change.
- [ ] Sign in (same or new Clerk user).
- [ ] Complete onboarding.
- [ ] Open `/users`.
- [ ] Run browser authenticated provisioning probe (`/api/me/provisioning-status`) and expect `200`.
- [ ] Run browser domain probe (`/api/users`) and expect `200`.
- [ ] Optional diagnostic: Update Settings in `/security-showcase`.

Expected:

- personal tenant is provisioned
- `/api/users` returns `200`
- no org is required

## 4. Scenario C - Org via Provider (Clerk Organizations)

Profile:

```dotenv
TENANCY_MODE=org
TENANT_CONTEXT_SOURCE=provider
```

### 4.1 Clerk setup

1. Enable Organizations in Clerk Dashboard.
2. Create organization for tests.
3. Add test user to this organization.
4. Set this org as active in current session (UserButton account/org context).
5. For role-path tests:
   - org role containing `admin`/`owner` -> internal `owner`
   - otherwise -> internal `member`

### 4.2 Negative path A (missing org context)

Checklist:

- [ ] Sign in user with no active org in session.
- [ ] Open `/users`.
- [ ] Run browser authenticated provisioning probe.
- [ ] Run browser domain probe.

Expected:

- redirect `/onboarding?reason=tenant-context-required`
- API status `409`, code `TENANT_CONTEXT_REQUIRED`

### 4.3 Negative path B (active org but tenant not provisioned yet)

Checklist:

- [ ] Activate org in session.
- [ ] Before onboarding, open `/users`.
- [ ] Run browser authenticated provisioning probe.
- [ ] Run browser domain probe.

Expected:

- still redirected to onboarding with `tenant-context-required`
- API status `409`, code `TENANT_CONTEXT_REQUIRED`

### 4.4 Positive path

Checklist:

- [ ] Complete onboarding with active org context.
- [ ] Open `/users`.
- [ ] Run browser authenticated provisioning probe (`/api/me/provisioning-status`).
- [ ] Run browser domain probe (`/api/users`).
- [ ] Optional diagnostic: Update Settings in `/security-showcase`.

Expected:

- onboarding provisioning succeeds
- protected routes work
- API status `200`

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
- [ ] Run browser authenticated provisioning probe.
- [ ] Run browser domain probe.

Expected:

- redirect `/onboarding?reason=tenant-context-required`
- API `409` + `TENANT_CONTEXT_REQUIRED`

### 5.2 Active tenant but no membership

Set non-member tenant in cookie:

```js
document.cookie =
  'active_tenant_id=10000000-0000-4000-8000-000000000002; path=/';
```

Run API probe.

Expected:

- status `403`
- code `TENANT_MEMBERSHIP_REQUIRED`

### 5.3 Active tenant with membership (success)

Use tenant where current user has membership.

In chained mode this is typically available after Scenario A:

```js
document.cookie =
  'active_tenant_id=10000000-0000-4000-8000-000000000001; path=/';
```

Then test:

- [ ] `/users` loads
- [ ] browser API probe returns `200`
- [ ] Optional diagnostic: `/security-showcase` action

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

## 7. Onboarding assertions

For every successful first login in each scenario:

- [ ] onboarding form submit returns success
- [ ] next request is not redirected back to onboarding
- [ ] `/users` and `/api/users` are usable
- [ ] `/api/me/provisioning-status` returns `200` and internal IDs

If onboarding fails, expected controlled error strings include:

- `Provisioning failed. Please try again.`
- `Missing required fields`

## 8. Non-UI provisioning security gates (required)

These checks cover critical paths not fully executable via Clerk-only manual flow.

```bash
pnpm test:db -- src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts -t "cross-provider email linking"
pnpm test:db -- src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts -t "free-tier limit"
```

Expected:

- both targeted DB test groups pass

## 9. Known limits in current runtime

- `AUTH_PROVIDER=authjs` and `AUTH_PROVIDER=supabase` are not yet runtime-complete.
- Identity source adapters for those providers currently return no authenticated identity.

Do not treat those provider runtime failures as tenancy/provisioning regressions yet.

## 10. Pass criteria

Checklist is PASS when:

1. All positive-path scenarios succeed (`single`, `personal`, `org/provider`, `org/db`) on `/users` and `/api/users`.
2. All negative-path scenarios return controlled responses (401/403/409 or onboarding redirect).
3. Non-UI provisioning security gates pass.
4. No unhandled runtime exceptions appear in terminal for tested flows.

## 11. Related docs

- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
- `docs/features/ENV-requirements.md`
- `docs/features/15 - Clerk Authentication.md`
- `docs/features/17 - Clerk Onboarding.md`
