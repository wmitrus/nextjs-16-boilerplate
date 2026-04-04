# Neon Database — Deployment Guide

This guide covers setting up **Neon Serverless Postgres** as the production database for this boilerplate, integrated with Vercel for both production and preview deployments.

> **Recommended path**: Vercel Native Integration (billing consolidated in Vercel, automatic preview branches per PR, zero manual env var wiring).

---

## 1. Integration Mode Decision

|                        | Vercel Native Integration                  | Direct Neon Account         |
| ---------------------- | ------------------------------------------ | --------------------------- |
| Billing                | Via Vercel invoice                         | Via Neon invoice            |
| Pricing                | Identical                                  | Identical                   |
| Env vars               | Auto-injected per environment              | Manual                      |
| Preview branches       | Automatic per PR                           | Manual setup                |
| Neon Console           | Full access                                | Full access                 |
| Neon CLI (`neon auth`) | Not available (use API key)                | Full                        |
| **When to use**        | **Starting fresh or want unified billing** | Already have a Neon account |

**Use the Vercel Native Integration** unless you have an existing Neon account to link.

---

## 2. Vercel Native Integration Setup

### Step 1 — Install from Vercel Marketplace

1. Go to [vercel.com/marketplace/neon](https://vercel.com/marketplace/neon) and click **Install**.
2. Choose **Create New Neon Account** (or **Link Existing Neon Account** if applicable).
3. Select a **region** close to your Vercel deployment region.
4. Select a **plan** (Free plan is sufficient to start).
5. Name your database (this becomes a Neon project).

### Important: Leave the Neon `Auth` Option Disabled

When Neon shows the optional setup checkbox:

- `Auth` — "Provide built-in authentication for app users, with profiles synced to Postgres"

For this repository, **do not enable it**.

This boilerplate currently uses **Clerk** as the implemented auth provider and routes all authenticated users through an **app-owned bootstrap and onboarding flow** before granting access to protected app routes.

Code-backed reasons:

- `AUTH_PROVIDER` defaults to `clerk` and the checked-in env surface is Clerk-first.
- request identity is established through Clerk in `src/proxy.ts`
- post-auth routing goes through `/auth/bootstrap/start`
- provisioning and onboarding truth are stored in the app database, not in provider-synced auth tables
- internal identity mappings are keyed by `provider + external id`, and the supported provider union is currently `clerk | authjs | supabase | neon`

Relevant files:

- `src/core/env.ts`
- `.env.example`
- `src/app/layout.tsx`
- `src/proxy.ts`
- `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
- `src/app/onboarding/actions.ts`
- `src/core/contracts/identity.ts`
- `src/modules/auth/index.ts`

Enabling Neon Auth here would introduce a **second auth authority** that the app does not currently consume.

### Step 2 — Connect to Your Vercel Project

1. In Vercel: **Storage → your database → Connect Project**.
2. Select your project and enable all three environments: **Production**, **Preview**, **Development**.
3. Under **Advanced Options → Deployments Configuration**, enable **Preview** branching.
4. Enable **Resource must be active before deployment**.
5. Click **Connect**.

Vercel now auto-injects these env vars per environment:

| Variable                                       | Purpose                       | Used by     |
| ---------------------------------------------- | ----------------------------- | ----------- |
| `DATABASE_URL`                                 | Pooled connection (PgBouncer) | Runtime app |
| `DATABASE_URL_UNPOOLED`                        | Direct connection             | Migrations  |
| `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` | Raw connection parts          | Optional    |

### Step 3 — Configure Boilerplate Env Vars

In Vercel **Environment Variables**, add or verify the following (in addition to the auto-injected Neon vars):

```dotenv
DB_PROVIDER=drizzle
DB_DRIVER=postgres
```

These must be set for all three environments (Production, Preview, Development).

The auto-injected `DATABASE_URL` maps directly to `src/core/env.ts` — no code changes needed.

---

## 3. Running Migrations

### Why `DATABASE_URL_UNPOOLED` for Migrations

Drizzle migrations run DDL statements inside a transaction session. PgBouncer (the pooled `DATABASE_URL`) operates in **transaction mode** on Neon and does not support session-level DDL. Always use the **unpooled** (direct) URL for migrations.

### Local Migration Against Production Database

1. Copy the **unpooled** connection string from Neon Console or Vercel Storage settings.
2. Set it in `.env.production`:

```dotenv
DATABASE_URL=postgresql://<user>:<password>@<host>.neon.tech/<dbname>?sslmode=require
```

> Use the `DATABASE_URL_UNPOOLED` value from Vercel, not the pooled `DATABASE_URL`.

3. Run:

```bash
pnpm db:migrate:prod:local
```

Use `db:migrate:prod:local` only for local operator runs that intentionally load `.env.production`.

`db:migrate:prod` must stay CI-friendly and read `DATABASE_URL` from the active environment without requiring a local file.

**No SSH tunnel required.** Neon supports direct external TLS connections from any IP.

### Automated Migrations on Preview Deployments

For Neon automated preview branching, let Vercel own the preview build so migrations run against the deployment-scoped preview branch variables that Neon injects at deploy time.

Required behavior:

1. Keep the Vercel project Build Command responsible for preview migrations.

Example:

```bash
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build
```

2. In GitHub Actions, do **not** run preview migrations before `vercel deploy` and do **not** use `vercel build` / `vercel deploy --prebuilt` for preview deployments.

Use a normal preview deploy instead:

```bash
vercel deploy --token="$VERCEL_TOKEN"
```

3. You may still run `vercel pull --yes --environment=preview --git-branch="$GIT_BRANCH"` locally in CI when you need preview env vars for validation, but do not treat that local cache as the migration authority for Neon preview branches.

Why this matters:

- Neon preview branch connection strings are injected for the specific deployment at deployment time.
- `DATABASE_URL_UNPOOLED` is the correct direct URL for Drizzle DDL.
- A local prebuild flow can migrate a different database than the final preview deployment uses.
- Letting Vercel run the preview build keeps the migration and the deployment on the same preview branch target.

### Automated Migrations on Production

Add a migration step before the production build in `prod-deploy.yml`:

```yaml
- name: Run DB Migrations (Production)
  shell: bash
  run: |
    set -a
    source .vercel/.env.production.local
    set +a
    export DATABASE_URL="$DATABASE_URL_UNPOOLED"
    pnpm db:migrate:prod
```

---

## 4. Preview Branch Strategy

When preview branching is enabled, Neon automatically:

1. Creates a branch `preview/<git-branch>` on every PR.
2. Injects branch-specific connection strings into that preview deployment only.
3. Deletes the branch when the Vercel deployment is removed (follows Vercel's 6-month retention by default).

Each preview branch is a **copy-on-write snapshot** of the production branch — zero additional storage cost until it diverges.

This means each PR gets an isolated database that mirrors production schema, which aligns with the boilerplate's self-bootstrapping provisioning model: the first sign-in on any preview deployment will provision its own tenant, roles, and policies automatically.

---

## 5. Env Var Summary Per Environment

### Production

| Variable                | Source                            | Value                                    |
| ----------------------- | --------------------------------- | ---------------------------------------- |
| `DATABASE_URL`          | Auto-injected by Neon integration | Pooled URL (`?sslmode=require` included) |
| `DATABASE_URL_UNPOOLED` | Auto-injected by Neon integration | Direct URL (used for migrations)         |
| `DB_PROVIDER`           | Manual                            | `drizzle`                                |
| `DB_DRIVER`             | Manual                            | `postgres`                               |

### Preview

Same as production. Connection strings point to the PR-specific branch, injected at deployment time and not visible in Vercel's env var settings (by design — branch-scoped injection only).

### `.env.production` (local — for running migrations manually)

```dotenv
DB_PROVIDER=drizzle
DB_DRIVER=postgres
DATABASE_URL=postgresql://<user>:<password>@<host>.neon.tech/<dbname>?sslmode=require
```

Use the `DATABASE_URL_UNPOOLED` value from Neon Console here, not the pooled one.

---

## 6. SSL

Neon requires TLS on all connections. The connection strings injected by the integration include `?sslmode=require`. This is sufficient for both `postgres.js` (runtime) and `drizzle-kit` (migrations) — no additional SSL config needed in `drizzle.prod.ts` or `create-postgres.ts` as long as the URL carries the `sslmode` parameter.

---

## 7. No Seed Required

Do not run `pnpm db:seed` against production or preview databases.

All RBAC data (tenants, roles, policies, tenant attributes) is provisioned automatically by `DrizzleProvisioningService.ensureProvisioned()` on first sign-in. See `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`.

---

## 8. Canonical References

| Topic                         | File                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------- |
| DB env vars                   | `src/core/env.ts`                                                               |
| Prod migration config         | `src/core/db/migrations/config/drizzle.prod.ts`                                 |
| Runtime postgres driver       | `src/core/db/drivers/create-postgres.ts`                                        |
| Migration script              | `package.json` → `db:migrate:prod`                                              |
| Provisioning (RBAC bootstrap) | `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts` |
| Env requirements              | `docs/features/ENV-requirements.md`                                             |
| Manual Vercel deploy guide    | `docs/features/DEPLOY-manual.md`                                                |

---

## 9. Auth Provider Comparison For This Repository

This section is specific to this boilerplate's current architecture, not a generic provider ranking.

### Current Recommendation

- **Use Clerk now** because it is the only fully implemented provider in the repo.
- **Do not enable Neon Auth** during Neon project creation for the current production setup.
- **Supabase Auth is the best future adapter candidate** if the team wants to keep a second provider path on the roadmap without implementing it yet.
- **Neon is represented in code only as a placeholder provider target and is still not runtime-ready.**

### Comparison Matrix

| Provider          | Current repo fit                     | Free tier                              | First paid plan                                                                     | Strengths                                                                                                    | Cost / risk notes for this repo                                                                                                                               |
| ----------------- | ------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clerk**         | **Fully implemented now**            | Hobby: free, 50,000 MRU per app        | Pro: $20/month                                                                      | Best fit with current Next.js UI, proxy, bootstrap, and onboarding flow                                      | Current production choice; no architecture change required                                                                                                    |
| **Supabase Auth** | **Possible future provider adapter** | Free: 50,000 MAU                       | Pro: from $25/month, 100,000 MAU included                                           | Mature auth product, many auth methods, strong docs, existing `AUTH_PROVIDER='supabase'` placeholder in repo | Still not implemented here; would require full request-identity, session, sign-in/up UI, and runtime integration work                                         |
| **Neon Auth**     | **Not a current adapter candidate**  | Included on Neon Free up to 60,000 MAU | Launch: usage-based, typical spend about $15/month, Neon Auth included up to 1M MAU | Tight database integration, auth branches with preview branches, database-auth co-location                   | Currently Beta, not represented in the repo provider contract, and would require adding a new provider path rather than just filling an existing adapter stub |

### Why Supabase Is The Better Future Adapter Placeholder

If the team wants to keep a low-cost alternative on the roadmap without implementing it immediately, **Supabase Auth is the cleaner choice to document as a future adapter**.

Why:

- the repo already exposes `AUTH_PROVIDER='supabase'`
- `SupabaseRequestIdentitySource` already exists as a placeholder adapter
- the provider union and internal identity mapping model already anticipate a Supabase-style external provider

Limitations:

- the adapter is currently a stub and throws at runtime
- the sign-in and sign-up UI are still Clerk-only
- proxy, bootstrap, and session handling would still need a full implementation and auth review

### Why Neon Auth Is Not "Adapter Only" In This Repo

Neon Auth is not just a missing adapter class in the current design.

Using it would require:

- extending the supported auth provider contract beyond `clerk | authjs | supabase`
- adding a Neon-specific request identity source
- replacing or generalizing the current Clerk-specific sign-in and sign-up UI
- integrating Neon session handling into `src/proxy.ts`
- validating that bootstrap, onboarding, and tenant-resolution rules still behave correctly with the new provider semantics

That is a **new auth-provider integration**, not a small adapter placeholder.

### Pricing Notes Captured At Review Time

These were the public pricing snapshots reviewed on 2026-04-01:

- **Clerk**: Hobby free with 50,000 MRU per app; Pro $20/month
- **Supabase**: Free with 50,000 MAU; Pro from $25/month with 100,000 MAU included
- **Neon Auth**: included in Neon Free up to 60,000 MAU; included in Neon Launch up to 1M MAU; Launch has no monthly minimum and is usage-based, with Neon showing a typical spend around $15/month for intermittent-load database usage

Always re-check vendor pricing before implementation work or procurement decisions.
