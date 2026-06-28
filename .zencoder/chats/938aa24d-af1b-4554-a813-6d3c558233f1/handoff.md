# Session Handoff — AuthJS Waitlist / Invite / Bootstrap Work

**Date**: 2026-04-24  
**Status**: Superseded / archival handoff — not the canonical active task record  
**Repo**: `/home/wojtek/projects/nextjs-16-boilerplate`

---

## Archival Note

This chat folder should be treated as a historical handoff, not as the canonical task workspace.

The work captured here was later split across dedicated repository task workspaces and follow-up docs:

- Invite acceptance fixes: `.copilot/tasks/2026-04-23-invite-flow-fix/`
- Admin bootstrap deploy design and workflow ownership changes: `.copilot/tasks/2026-05-05-admin-bootstrap-deploy-design/`
- Migration desync / prod migration wrapper follow-up: `.copilot/tasks/investigate-ci-migrations/`
- Durable docs: `docs/features/33 - Waitlist Email Flow.md` and `docs/features/34 - Admin Bootstrap.md`

Important: some recommendations in this handoff were later superseded. In particular, automatic preview/production bootstrap workflow ownership was revisited and narrowed in the later canonical tasks above.

---

## Context Window Summary

This session covered three major areas:

1. Waitlist email flow fixes and documentation
2. Invite acceptance flow bug fixes (three root causes)
3. Admin bootstrap for single-tenancy — script + CI wiring

---

## What Was Completed This Session (Code & Docs)

### Waitlist Email Flow

- **Approval email for `TENANCY_MODE=single`** — was never sent. Fixed: `resolveSingleTenancyInviteTarget()` in `src/app/api/admin/waitlist/[id]/route.ts` queries `organizationsTable WHERE tenantId = DEFAULT_TENANT_ID` at approval time.
- **Rejection email** — default flipped to `true` in `src/core/env.ts` (WAITLIST_SEND_REJECTION_EMAIL). Industry standard is opt-out.
- **`docs/features/33 - Waitlist Email Flow.md`** — created (228 lines: lifecycle events, env vars, implementation map, invite acceptance flowchart).

### Invite Acceptance — Three Bugs Fixed

**Bug 1 — BlockingRoute error** (`src/app/auth/invite/[token]/page.tsx`):

- Wrapped `InviteTokenPageContent` (async) in outer `InviteTokenPage` with `<Suspense fallback={<LoadingInvitePage />}>`
- Replaced `await connection()` with `await getServerRequestLogContext()`

**Bug 2 — Unauthenticated user redirected to login** (`src/security/middleware/route-policy.ts`):

- Added `/auth/invite` to `PUBLIC_ROUTE_PREFIXES` (was treated as protected route)

**Bug 3 — Authenticated user with different email lost the token** (`src/app/auth/invite/[token]/page.tsx`):

- Added `EmailMismatchPage` UI with amber warning card and `InviteSignOutButton` (client component, `signOut({ callbackUrl: invite-url })`)
- Fixed `SignUpPageContent` to redirect to `/auth/invite/[token]` (not `/`) when session email ≠ invited email

### Invitation Signup Flow — Three More Fixes

**Bug 4 — "Registration is currently closed" shown with valid token** (`src/app/api/auth/signup/route.ts`):

- The `REGISTRATION_MODE !== 'open'` 403 gate fired BEFORE body was parsed, so `invitationToken` was never checked
- Fixed: gate now runs after body parse; if `invitationToken` present → validate token first → use **invitation email** (not body email, security-critical)

**Bug 5 — Signup form shows empty email field for invite flow** (`src/app/auth/signup/page.tsx`):

- Page now resolves `invitedEmail` server-side via invitation service before rendering
- If token invalid at this point → redirects back to `/auth/invite/[token]`

**Bug 6 — Full form shown instead of invitation UX** (`src/app/auth/signup/sign-up-client.tsx`):

- When `invitedEmail` is set: shows blue "Invitation for: email" box + hidden email input, only password fields shown
- Button text: "Create account & accept invitation"

**Bug 7 — Email verification required after accepting invitation** (`src/app/api/auth/signup/route.ts`):

- Clicking an invitation email link proves inbox ownership — separate verification is redundant
- Security confirmed by Security Agent, architecture confirmed by Architecture Agent
- Fixed: `emailVerified = devAutoVerify || Boolean(invitationToken)` — invitation-based signups skip verification and go directly to signin

### Admin Bootstrap Script (`scripts/bootstrap-admin.ts`)

- Production-grade CLI script: creates first admin, tenant, org, owner role, ABAC policies, membership
- Idempotent: exits if any user already exists
- Required env vars: `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `DEFAULT_TENANT_ID`
- New package.json scripts: `bootstrap:admin` and `bootstrap:admin:prod:local`
- **`docs/features/34 - Admin Bootstrap.md`** — created (deadlock problem, safety properties, Vercel workflow)

### Migration + Bootstrap CI Wiring

- **`src/core/db/migrations/config/drizzle.prod.ts`** — now prefers `DATABASE_URL_UNPOOLED ?? DATABASE_URL`
- **`scripts/bootstrap-admin.ts`** — `resolveDatabaseUrl()` prefers `DATABASE_URL_UNPOOLED` for postgres driver
- **`.github/workflows/prod-deploy.yml`** — added `Bootstrap Admin Account (idempotent)` step after migrations (conditional on `BOOTSTRAP_ADMIN_EMAIL` secret)
- **`.github/workflows/preview-deploy.yml`** — added `Run DB Migrations (Preview)` step (was missing!) + `Bootstrap Admin Account` step

---

## Root Cause of Production DB Desync (IMPORTANT)

### Why migrations showed "applied" but tables were missing

Neon provides two connection types:

- `DATABASE_URL` → pooled via PgBouncer (transaction mode)
- `DATABASE_URL_UNPOOLED` → direct connection

**DDL migrations (CREATE TABLE, ALTER TABLE) MUST use the direct connection.** PgBouncer in transaction mode causes DDL to fail silently mid-migration. The Drizzle `__drizzle_migrations` journal gets entries recorded for migrations that only partially executed.

The CI always did this correctly (`export DATABASE_URL="$DATABASE_URL_UNPOOLED"`). Local scripts did not. Now fixed: `drizzle.prod.ts` and `bootstrap-admin.ts` both prefer unpooled internally.

---

## Historical Open Items At Handoff Time

### Production Database Still Had Missing Tables

The Neon production database is in a partial migration state. Confirmed missing:

- `organizations` table (PG code 42P01)
- Likely also: `invitations`, `waitlist_entries`, `auth_organization_identities`, and related indexes/FKs from migration 0008

**`.env.production` already has `DATABASE_URL_UNPOOLED` set** (confirmed present).

### Steps that were proposed at handoff time:

```bash
# Step 1: ensure .env.production has DATABASE_URL_UNPOOLED (already confirmed present)

# Step 2: apply all pending migrations using the fixed script
pnpm db:migrate:prod:local

# Expected output: should apply migration 0008 (organizations, invitations, waitlist_entries etc.)
# and migrations 0009-0011 if not yet applied

# Step 3: bootstrap the admin account
pnpm bootstrap:admin:prod:local
# Reads BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD from .env.production
# Add those two lines to .env.production before running:
#   BOOTSTRAP_ADMIN_EMAIL=admin@yourcompany.com
#   BOOTSTRAP_ADMIN_PASSWORD=<strong-password>

# Step 4: verify at https://your-production-url/auth/signin
# Sign in with the bootstrap credentials
# Check access at /admin
```

### If migration still fails after fix

If `pnpm db:migrate:prod:local` says "No migrations to run" but organizations still missing (journal desync), apply the missing tables manually in Neon SQL editor:

```sql
-- Run in Neon SQL editor (console.neon.tech → your project → SQL editor)
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "unique_org_slug_per_tenant" UNIQUE("tenant_id","slug")
);

CREATE TABLE IF NOT EXISTS "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "invited_by_user_id" uuid,
  "email" text NOT NULL,
  "role_id" uuid NOT NULL,
  "token" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invitations_token_unique" UNIQUE("token")
);

CREATE TABLE IF NOT EXISTS "waitlist_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "organization_id" uuid,
  "tenant_id" uuid,
  "status" text DEFAULT 'pending' NOT NULL,
  "approved_at" timestamp with time zone,
  "notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email")
);
```

Then retry bootstrap.

---

## GitHub Secrets Required for CI Bootstrap

Add to GitHub repo → Settings → Secrets → Actions:

| Secret                     | Description                             |
| -------------------------- | --------------------------------------- |
| `BOOTSTRAP_ADMIN_EMAIL`    | Admin email (e.g. `admin@company.com`)  |
| `BOOTSTRAP_ADMIN_PASSWORD` | Strong password ≥8 chars                |
| `DEFAULT_TENANT_ID`        | Must match your `.env.production` value |

Bootstrap step is **idempotent** — after first run it skips with "Skipped — N users already exist."

---

## Validation State

| Check                                 | Status                                       |
| ------------------------------------- | -------------------------------------------- |
| `pnpm typecheck`                      | ✅ clean                                     |
| `pnpm lint --fix`                     | ✅ clean                                     |
| Unit tests                            | not run in this session                      |
| Production DB                         | ❌ migration desync — needs manual fix above |
| Bootstrap script local                | ❌ blocked by DB desync                      |
| Invite flow (local dev)               | ✅ working per user confirmation             |
| Email verification bypass for invites | ✅ implemented and security-approved         |

---

## Modified Files (Uncommitted)

```
src/app/api/auth/signup/route.ts          — invite gate, email from token, emailVerified logic
src/app/auth/signup/page.tsx              — resolves invitedEmail server-side
src/app/auth/signup/sign-up-client.tsx    — invitation UX (pre-filled email, password only)
src/app/auth/invite/[token]/page.tsx      — Suspense wrapper, EmailMismatchPage, InviteSignOutButton
src/security/middleware/route-policy.ts   — added /auth/invite to PUBLIC_ROUTE_PREFIXES
src/core/db/migrations/config/drizzle.prod.ts  — prefers DATABASE_URL_UNPOOLED
src/core/env.ts                           — WAITLIST_SEND_REJECTION_EMAIL default → true
scripts/bootstrap-admin.ts               — prefers DATABASE_URL_UNPOOLED, better error output
.github/workflows/prod-deploy.yml        — bootstrap admin step added
.github/workflows/preview-deploy.yml     — migrations step added + bootstrap step
package.json                              — bootstrap:admin and bootstrap:admin:prod:local scripts
docs/features/33 - Waitlist Email Flow.md — created
docs/features/34 - Admin Bootstrap.md    — created
```

---

## Historical Open Items / Not Started

1. **Password Policy Enforcement** — planned, not started
2. **Unit test coverage gap** — ~74% vs 75% threshold (close, pre-existing)
3. **E2E tests for AuthJS flows** — planned, not started
4. **Preview DB isolation** — preview workflow now runs migrations but it is unclear if preview has its own Neon branch. Should be verified.

---

## Key Architecture Notes for Next Session

- `src/proxy.ts` is the middleware (not `middleware.ts`)
- `await connection()` must precede any `getAppContainer()` call in RSC pages
- Invitation email IS email verification — `emailVerified = true` on invite-based signup is correct (Security Agent approved)
- `BOOTSTRAP_ADMIN_EMAIL` in env grants admin UI access (two-layer model: env-based + DB owner role)
- Bootstrap script is idempotent — safe to run on every deploy
- All Drizzle prod DDL must use `DATABASE_URL_UNPOOLED` (direct connection), not pooled
