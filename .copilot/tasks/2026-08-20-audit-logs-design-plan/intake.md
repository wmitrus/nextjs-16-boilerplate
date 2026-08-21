# Audit Logging — Design Intake

## User Objective

Design (not yet implement) a professional audit-logging feature for the
admin area: admins must be able to switch audit capture on/off **per
feature/category**, captured events must actually persist (not just pass
through the structured logger), and the design must explicitly protect
database space. A second deliverable is a concrete "where must audit
tracking be added" implementation map so nothing already in the app is
forgotten when this gets built.

## Current-State Findings (verified in code, not assumed)

- `SECURITY_AUDIT_LOG_ENABLED` (`src/core/env.ts`) is the **only** existing
  toggle today, and it is a single global on/off switch read from env at
  process start — no per-category control, no admin UI, no DB persistence,
  requires a redeploy to change.
- `src/security/actions/action-audit.ts` (`logActionAudit`) already redacts
  sensitive fields and logs every `createSecureAction` mutation via Pino —
  but its own comment says: *"In a real production app, you might send this
  to a dedicated audit database..."* — that dedicated sink does not exist
  yet. This is the natural single integration point for automatic coverage
  of every secure server action.
- `src/security/utils/security-logger.ts` (`logSecurityEvent`) covers
  high-severity events (SSRF attempts, tenant violations) the same way —
  log-only today.
- `RESOURCES.SECURITY` / `ACTIONS.SECURITY_READ_AUDIT` already exist in
  `src/core/contracts/resources-actions.ts` and are already granted in an
  admin/owner policy template (`src/modules/provisioning/policy/templates.ts`)
  — but nothing currently implements the read side. This is a pre-existing,
  unused hook to build on rather than a new resource to invent.
- Admin mutation routes under `src/app/api/admin/**` (users, organizations,
  roles, policies, memberships, invitations, waitlist, feature-flags) log via
  ad hoc `logger.info({ event: 'admin:...' })` calls at each route — they do
  **not** go through `createSecureAction`, so they are not covered by
  `logActionAudit` and need explicit instrumentation.
- The `feature-flags` module (`src/modules/feature-flags/**`) is the closest
  existing precedent for "admin-toggleable, DB-backed, tenant-scoped
  setting": `featureFlagsTable` (global row = `tenantId: null`, tenant row
  overrides), `DrizzleFeatureFlagAdminService` (admin-only CRUD, not
  DI-registered, tenant-scoped mutation predicate per SEC-26), and the
  `/api/admin/feature-flags` route (ABAC + `isEnvBasedPlatformAdmin`
  fallback). The audit-settings design reuses this shape rather than
  inventing a new one.
- No retention/purge/partitioning job exists anywhere in `scripts/` today —
  DB-space management for a new high-write-volume table is new work, not an
  extension of something already there.

## In-Scope Repository Inputs

- `docs/features/20 - Enterprise Security Architecture.md` (§6, §7)
- `docs/features/12 - Logging & Observability.md`
- `docs/architecture/10 - Modular Monolith - File Catalog.md`
- `docs/architecture/Enterprise-Ready DB layer/*`
- `src/security/actions/action-audit.ts`, `src/security/utils/security-logger.ts`
- `src/modules/feature-flags/**` (pattern precedent)
- `src/modules/authorization/infrastructure/drizzle/schema.ts` (tenant/org modeling precedent)
- `src/app/admin/**`, `src/app/api/admin/**` (every existing admin surface)
- `src/core/contracts/resources-actions.ts`, `src/core/env.ts`

## Readiness Checklist

- [done] Existing audit/logging mechanism read and confirmed log-only (no DB persistence).
- [done] Existing single global toggle (`SECURITY_AUDIT_LOG_ENABLED`) confirmed as the gap being closed.
- [done] Precedent pattern for admin-toggleable DB-backed settings identified (feature-flags module).
- [done] Every existing admin mutation surface enumerated for the instrumentation map.
- [done] DB-space controls (retention, partitioning, sampling, redaction, size caps) explicitly designed, not deferred.
- [done] Plan produced as `.copilot/tasks/2026-08-20-audit-logs-design-plan/plan.md`.
- [blocked] Leantime open/close: no real `.env.leantime` / `.env.leantime-dev` present in this session (only the committed `.env.leantime.example` / `.env.leantime-dev.example` templates) — the `pnpm lt` CLI entrypoint exists in `package.json`, but this sandbox has no live Leantime credentials to open/close a tracked task against. Reported as a session limitation, not treated as evidence the integration itself is broken.

## Constraints

- This task is a **design plan**, not an implementation — no schema, migration,
  or route code is written here; the deliverable is the plan document plus this
  intake record.
- Do not invent DB/ORM primitives the repo doesn't have (e.g. no Prisma — this
  repo uses Drizzle; native Postgres declarative partitioning, not a
  Drizzle-schema partition API, since Drizzle has no first-class partition DDL).
- Must not silently drop the existing `SECURITY_AUDIT_LOG_ENABLED` /
  `logActionAudit` / `logSecurityEvent` behavior — the plan extends it,
  it doesn't replace the structured-logging sink.
- `pnpm lint` / `pnpm lint --fix` must not be run (documented agent-shell hang).
