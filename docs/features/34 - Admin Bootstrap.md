# 34 — Admin Bootstrap for Single-Tenancy Deployments

## The Problem

When deploying with `REGISTRATION_MODE=invite-only` and `AUTH_PROVIDER=authjs`, a fundamental deadlock exists:

- No admin exists → no one can send invitations
- No invitations exist → no one can register
- **Result**: The app is completely sealed from day one

Temporarily switching to `REGISTRATION_MODE=open` has a critical race window:

> Between deploy and switching back, **any external actor who discovers the URL can register and become the platform owner**. This is not production-grade.

---

## The Solution: `pnpm bootstrap:admin`

A CLI script that creates the first admin account directly in the database — bypassing the HTTP registration flow entirely. The app never needs to open registration.

**Industry equivalents:**

| Product          | Command                            |
| ---------------- | ---------------------------------- |
| Ghost            | `ghost setup`                      |
| Gitea            | `gitea admin user create --admin`  |
| Discourse        | `rake admin:create`                |
| Strapi           | `pnpm payload admin:create`        |
| Pocketbase       | Web UI on first run (0-user guard) |
| This boilerplate | `pnpm bootstrap:admin`             |

---

## Safety Properties

| Property                        | Behaviour                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Idempotent**                  | Exits without changes if any user already exists in the DB                                                                                         |
| **Race-safe**                   | DB unique constraints prevent duplicates even under concurrent runs                                                                                |
| **No open registration needed** | `REGISTRATION_MODE=invite-only` is never changed                                                                                                   |
| **No race window**              | The admin account exists before the app serves any traffic                                                                                         |
| **ABAC policies applied**       | Owner-role policies are seeded from the same `ownerPolicies` template used by the normal provisioning flow                                         |
| **Email pre-verified**          | No email verification step required for the bootstrap admin                                                                                        |
| **Not in Next.js runtime**      | `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are read only by the script — they are not in `src/core/env.ts` and not loaded into the app |

---

## Required Environment Variables (Script Only)

These are consumed ONLY by `scripts/bootstrap-admin.ts`. They are NOT loaded into the Next.js application runtime.

| Variable                   | Required     | Description                                             |
| -------------------------- | ------------ | ------------------------------------------------------- |
| `BOOTSTRAP_ADMIN_EMAIL`    | ✅           | Email address for the admin account                     |
| `BOOTSTRAP_ADMIN_PASSWORD` | ✅           | Password (min 8 chars — use a strong random secret)     |
| `DEFAULT_TENANT_ID`        | ✅           | UUID for the single tenant (must match the app config)  |
| `DATABASE_URL`             | For postgres | Postgres connection string                              |
| `DB_DRIVER`                | No           | `postgres` (default) or `pglite`                        |
| `BOOTSTRAP_ORG_NAME`       | No           | Display name for the org (default: `Main Organization`) |

---

## Deployment Workflow

### Fresh deployment (first time)

```bash
# 1. Run database migrations
pnpm db:migrate:prod

# 2. Create the first admin account (idempotent — safe to re-run)
BOOTSTRAP_ADMIN_EMAIL=admin@company.com \
BOOTSTRAP_ADMIN_PASSWORD=<strong-random-secret> \
  pnpm bootstrap:admin

# 3. Start the app — registration stays closed
REGISTRATION_MODE=invite-only \
  pnpm start
```

### After bootstrap

1. Sign in at `/auth/signin` with `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`
2. Visit `/admin` to confirm access
3. Go to `/admin/waitlist` or send invitations from `/admin`
4. **Remove `BOOTSTRAP_ADMIN_PASSWORD` from your env** (the account already exists — keeping the password in env is a credential-at-rest risk)
5. If these vars were set only for one-time bootstrap, remove `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ORG_NAME` too
6. Optionally: set a new password through the app (if password change UI is implemented)

### Vercel deployment

Vercel does not provide a terminal for arbitrary command execution. The professional pattern (same as `pnpm db:migrate:prod:local`) is to run against the production database **from your local machine** with the production env vars pulled via Vercel CLI.

### Vercel env matrix

| Variable                                 | Preview                                | Production                             | Notes                                                                 |
| ---------------------------------------- | -------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `DEFAULT_TENANT_ID`                      | ✅ Required when `TENANCY_MODE=single` | ✅ Required when `TENANCY_MODE=single` | Runtime config. Must live in Vercel env, not GitHub workflow secrets. |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | As required by the app / preview DB    | As required by the app / prod DB       | Needed so bootstrap targets the correct database.                     |
| `BOOTSTRAP_ADMIN_EMAIL`                  | Optional                               | Temporary only                         | Needed only when you intentionally run bootstrap.                     |
| `BOOTSTRAP_ADMIN_PASSWORD`               | Optional                               | Temporary only                         | Remove immediately after bootstrap succeeds.                          |
| `BOOTSTRAP_ORG_NAME`                     | Optional                               | Optional temporary override            | If omitted, defaults to `Main Organization`.                          |

**Recommended setup:**

- Preview: add bootstrap vars only if QA needs an auto-created admin account in preview.
- Production: do not keep bootstrap vars permanently in Vercel. Add them only for the one-time bootstrap operation, then remove them.
- Both environments: `DEFAULT_TENANT_ID` stays in Vercel because it is real runtime config in single-tenant mode.

```bash
# 1. Pull production env vars from Vercel to a local file
vercel env pull .env.production

# 2. Temporarily add bootstrap credentials to that file (do NOT commit)
echo "BOOTSTRAP_ADMIN_EMAIL=admin@company.com" >> .env.production
echo "BOOTSTRAP_ADMIN_PASSWORD=<strong-secret>" >> .env.production

# 3. Run the script against the production DB from your local machine
pnpm bootstrap:admin:prod:local
# equivalent to:
# node --env-file=.env.production --import tsx scripts/bootstrap-admin.ts

# 4. Delete .env.production (contains DB credentials)
rm .env.production
```

### One-time production bootstrap runbook

```bash
# 1. Confirm the production environment already has the normal runtime vars,
# including DEFAULT_TENANT_ID for single-tenant mode.

# 2. Pull the production env locally.
vercel env pull .env.production

# 3. Add temporary bootstrap-only vars locally.
echo "BOOTSTRAP_ADMIN_EMAIL=admin@company.com" >> .env.production
echo "BOOTSTRAP_ADMIN_PASSWORD=<strong-secret>" >> .env.production
# Optional override:
# echo "BOOTSTRAP_ORG_NAME=Main Organization" >> .env.production

# 4. Run the bootstrap script against production.
pnpm bootstrap:admin:prod:local

# 5. Sign in and verify /admin access.

# 6. Remove the temporary local env file.
rm .env.production

# 7. If you added bootstrap vars to Vercel itself for a one-off run,
# remove BOOTSTRAP_ADMIN_PASSWORD immediately and remove the other
# bootstrap vars too unless you intentionally keep them for preview automation.
```

**Why this works**: `DATABASE_URL` in Vercel production env points to Neon/Supabase/PlanetScale. The script connects to that same DB from your local machine — same as running migrations locally against the prod DB.

**Alternative**: Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in Vercel → Settings → Environment Variables → **Production only**, optionally set `BOOTSTRAP_ORG_NAME`, then use a one-off Vercel CLI invocation or a deploy hook that runs once. Remove `BOOTSTRAP_ADMIN_PASSWORD` immediately after bootstrap is confirmed. Remove the remaining bootstrap vars too unless you intentionally keep them for preview-only automation.

### Reset and re-bootstrap

After `pnpm db:dev:reset` or `pnpm db:migrate:prod` on a fresh DB:

```bash
pnpm bootstrap:admin
```

The script checks user count first — if users exist, it skips silently.

---

## Two-Layer Admin Access Model

The boilerplate uses two independent layers for platform admin access. Both must be in place:

```
Layer 1 — DB role (authoritative, permanent)
  Created by: pnpm bootstrap:admin
  Grant: owner role in organizationsTable + ABAC policies in policiesTable
  Checked by: DrizzleRoleRepository → AuthorizationService → ABAC checks

Layer 2 — ADMIN_USER_EMAILS env (fallback / emergency)
  Set in: Vercel env vars (Production only)
  Grant: bypasses ABAC check for SECURITY_MANAGE_POLICIES
  Checked by: isEnvBasedPlatformAdmin() in AdminLayoutGuard
  Purpose: access during initial setup before DB role is confirmed,
           and emergency recovery if DB role is lost
```

**Typical lifecycle:**

```
Deploy → bootstrap:admin → Layer 1 active → verify access
  → keep ADMIN_USER_EMAILS for emergency
  → optionally remove BOOTSTRAP_ADMIN_PASSWORD
```

---

## What the Script Creates

For `TENANCY_MODE=single` with `DEFAULT_TENANT_ID=<uuid>`:

```
tenantsTable              { id: DEFAULT_TENANT_ID, name: BOOTSTRAP_ORG_NAME }
organizationsTable        { id: <random-uuid>, tenantId: DEFAULT_TENANT_ID, name: BOOTSTRAP_ORG_NAME }
tenantAttributesTable     { tenantId: DEFAULT_TENANT_ID, plan: 'standard', ... }
usersTable                { id: <random-uuid>, email: BOOTSTRAP_ADMIN_EMAIL, onboardingComplete: true }
userCredentialsTable      { userId, email, hashedPassword, emailVerified: true }
authUserIdentitiesTable   { provider: 'authjs', externalUserId: userId, userId }
rolesTable                { owner + member roles for the org }
policiesTable             { ABAC policies for owner role (from ownerPolicies template) }
membershipsTable          { userId, orgId, ownerRoleId }
```

All inserts use `ON CONFLICT DO NOTHING` — safe to run multiple times.

---

## Security Notes

- `BOOTSTRAP_ADMIN_PASSWORD` is bcrypt-hashed (cost 12) before storage — the plaintext is never written to the DB
- The script reads env vars directly — the password is never transmitted over HTTP
- After bootstrap, the admin account is protected only by the password — use a strong, unique secret
- `ADMIN_USER_EMAILS` is a secondary safeguard — it bypasses ABAC but NOT authentication; the admin must still sign in with their real credentials
- Do not use the same password for multiple deployments (staging, production should have different bootstrap secrets)

---

## Related Documentation

- `docs/features/32 - AuthJS Custom Auth Provider.md` — full AuthJS flow, admin bootstrap section
- `docs/features/33 - Waitlist Email Flow.md` — invite flow after bootstrap
- `docs/features/20 - Enterprise Security Architecture.md` — ABAC, role system
- `src/security/core/platform-admin.ts` — `isEnvBasedPlatformAdmin()` utility (Layer 2)
- `scripts/bootstrap-admin.ts` — the bootstrap script
