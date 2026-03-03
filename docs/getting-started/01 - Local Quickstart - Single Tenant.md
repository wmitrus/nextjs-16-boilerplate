# Local Quickstart - Single Tenant

## Goal

Run the boilerplate in the simplest runtime profile:

- `AUTH_PROVIDER=clerk`
- `TENANCY_MODE=single`
- one shared internal tenant (`DEFAULT_TENANT_ID`)

## 0. Prerequisites

- Node.js `24.x`
- `pnpm`
- Clerk app keys (`pk_...`, `sk_...`)

## 1. Install + init env

```bash
pnpm install
pnpm env:init
```

## 2. Minimal `.env.local`

```dotenv
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

AUTH_PROVIDER=clerk
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

TENANCY_MODE=single
DEFAULT_TENANT_ID=550e8400-e29b-41d4-a716-446655440000

DB_PROVIDER=drizzle
DB_DRIVER=pglite
DATABASE_URL=file:./data/pglite
```

Validate:

```bash
pnpm env:check
```

## 3. Prepare DB

```bash
pnpm db:migrate:dev
pnpm db:seed
```

## 4. Run app

```bash
pnpm dev
```

Open `http://localhost:3000`.

## 5. Sign in and complete onboarding

1. Sign in via `/sign-in`.
2. Open `/onboarding` if redirected.
3. Submit onboarding form.

Expected result:

- provisioning succeeds
- profile is saved
- onboarding flag is set

## 6. Important Clarification

In `TENANCY_MODE=single`, Clerk organization context is not required.

- no active `orgId` is needed
- tenant context comes from `DEFAULT_TENANT_ID`

## 7. Troubleshooting

### Startup error: `TENANCY_MODE=single requires DEFAULT_TENANT_ID`

Set `DEFAULT_TENANT_ID` to a valid UUID.

### Onboarding error: `Provisioning failed`

Check:

1. Clerk keys are valid
2. DB migrations are applied
3. `DEFAULT_TENANT_ID` exists in seeded data

### Redirect loop to `/onboarding`

Onboarding profile write did not complete. Check server logs and rerun onboarding submit.

## Related Docs

- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
- `docs/features/ENV-requirements.md`
