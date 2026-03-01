# Local Quickstart - Single Tenant

## Goal

Run the boilerplate locally with the simplest supported tenant model:

- one authenticated user
- one active tenant context (single organization)
- local DB + seeded baseline data

This runbook is designed for first-time setup without architecture guesswork.

---

## 0) Prerequisites

- Node.js `24.x`
- `pnpm`
- Clerk application (publishable + secret key)

Optional (for local Postgres workflow):

- Podman (default in this repo) or Docker

---

## 1) Install and initialize env

```bash
pnpm install
pnpm env:init
```

This creates `.env.local` from `.env.example`.

---

## 2) Set minimum required environment variables

In `.env.local`, ensure at least:

```dotenv
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

AUTH_PROVIDER=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

DB_PROVIDER=drizzle
DB_DRIVER=pglite
DATABASE_URL=file:./data/pglite
```

Then validate:

```bash
pnpm env:check
```

---

## 3) Prepare database state

Apply migrations and seed baseline data:

```bash
pnpm db:migrate:dev
pnpm db:seed
```

Notes:

- `db:seed` creates baseline users/tenants/roles/policies for local development.
- This is required for security and authorization demos to behave predictably.

---

## 4) Start the app

```bash
pnpm dev
```

Open: `http://localhost:3000`

---

## 5) Configure single-tenant session in Clerk

This architecture is tenant-aware, even in “single tenant” mode.

You must have an active organization context (`orgId`) in session.

### Required steps (Clerk)

1. Create one organization in Clerk (example: `Default Tenant`).
2. Add your test user to that organization.
3. Sign in to the app with that user.
4. Ensure the user session has this org as active context.

### Recommended Organizations settings (first-time setup)

- Membership option: **Membership required**
- Role set: **Default role set** (Admin, Member)
- Enable organization slugs: **On**
- Create first organization automatically: **On**
- Allow user-created organizations: **Off** (single-tenant discipline)

### Important role model note

Clerk organization roles are not the primary authorization source in this boilerplate.

Current runtime authorization is evaluated from application DB memberships/policies,
while Clerk provides identity + active organization context (`orgId`).

So for local setup:

1. Clerk role set must exist (default is enough).
2. Active org context must be present in session.
3. DB seed/membership/policy data must be present for action authorization.

If active org context is missing, secure actions return:

- `Tenant context required`

This is expected and correct.

---

## 6) Verify `security-showcase` flow

1. Open `/security-showcase`
2. Sign in
3. Submit **Update Settings**

Expected outcomes:

- no unhandled exception
- controlled security result (`success` or controlled `unauthorized`), depending on your local authz data

---

## 7) Troubleshooting

### `Tenant context required`

Cause:

- authenticated user has no active tenant/org context in session

Fix:

- assign user to organization in Clerk and activate it in session

### `Authentication required`

Cause:

- user is not authenticated in current session

Fix:

- sign in again and verify session cookies are present

### `Permission denied for action ...`

Cause:

- user is authenticated but not authorized for the tenant/resource/action combination

Fix:

- verify seeded data and authorization membership/policies for your local scenario

---

## 8) Why single-tenant still needs tenant context

Security/authorization is intentionally tenant-scoped.

Even if your product starts as “single tenant,” this boilerplate enforces:

- explicit tenant identity in security context
- tenant-scoped authorization decisions

Recommended baseline convention:

- keep one default tenant/org in development
- treat missing tenant context as setup error, not as fallback-to-guest

---

## Related Docs

- [Environment & T3-Env](../features/11%20-%20Environment%20%26%20T3-Env.md)
- [Testing Usage & DB Workflows](../usage/03%20-%20Testing%20Usage%20%26%20DB%20Workflows.md)
- [Edge vs Node Composition Root Boundary](../architecture/15%20-%20Edge%20vs%20Node%20Composition%20Root%20Boundary.md)
- [Extending App Safely - Edge vs Node Authorization](../usage/04%20-%20Extending%20App%20Safely%20-%20Edge%20vs%20Node%20Authorization.md)
