# Intake

## Objective

Build read-only diagnostic tooling that inventories the live Drizzle
schema's tenant/organization topology and identifier semantics, dry-run
only against local databases this pass.

## Scope

- All 8 module schema files under `src/modules/*/infrastructure/drizzle/schema.ts`
  plus `src/core/db/schema/references.ts` (21 real tables).
- New tooling under `scripts/tenancy-inventory/`.
- Dry-run against local `test-db` (5433) and `dev-db` (5432) only.

## Non-Goals

- Any staging/production query execution.
- Any data repair, backfill, reparenting, or schema change.
- Deciding the final canonical two-ID model — this pass only inventories
  the current state as migration input for Phase 1.

## Environment

- Local `dev-db` and `test-db` (podman) both up and migrated at task start
  (brought up during OZI-76).

## Verification Sources

- Live Drizzle schema on `audit/ozi-75-tenant-org-topology-inventory`,
  branched from `main` post-OZI-76 (`92a3ba8c`).
- `docs/ai/general/SCRIPT_IMPLEMENTATION_PATTERNS.md`,
  `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
- Prior evidence from OZI-77 (`AdminOrganizationsScope`'s docstring:
  `TenantContext.tenantId` and `TenantContext.organizationId` hold the same
  value) as the concrete example of the conflation this inventory
  documents structurally.

## Readiness

- [x] canonical Linear issue exists (OZI-75, In Progress)
- [x] local read-only test environment confirmed working
- [x] tooling built, dry-run evidence produced (kept outside the repo)
- [x] read-only enforcement proven against real Postgres
- [ ] user review of the finished query set (blocks any staging/production
      follow-up)
- [ ] Linear closure update

## Open Questions (deferred to the staging/production follow-up, per the user)

- Which production/staging environments are authorized for inventory?
- Where should sensitive environment-specific evidence for those
  environments be retained (same `~/.local/share/...` layout, or a
  different location per environment's operational policy)?
- Should aggregate counts against staging/production be bucketed/rounded
  rather than exact, to avoid revealing precise operational scale? (Not
  applicable to local dev/test data this pass.)
