# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-08-14-authjs-vercel-prebuilt-root-cause-audit`
- Scope: placement and ownership of the Production single-tenant readiness fix.
- Status: APPROVED AND IMPLEMENTED LOCALLY.
- Last updated: 2026-08-15.

## Findings

- `DEFAULT_TENANT_ID` is deployment-owned runtime configuration, while tenant,
  organization, membership, role, and policy rows are database-owned state.
- Schema migrations own schema evolution, not one-time operational tenant data.
- Auth/bootstrap runtime correctly consumes these boundaries and fails closed
  when they disagree.
- The failure does not justify an App Router, DI, provisioning, or auth-provider
  redesign.

## Architectural Decision

- Keep runtime provisioning unchanged.
- Add the consistency check under `scripts/`, beside migration/bootstrap
  operations, using existing DB infrastructure and schema ownership.
- Run the check in Production orchestration after migration ownership has run
  and before artifact upload/promotion.
- Keep Preview source-built and deployment-scoped; do not query a potentially
  different DB from GitHub before Neon performs branch binding in Vercel.

## Risks And Constraints

- The checker is read-only and has no runtime/client bundle surface.
- It validates only the required single-tenant prerequisite: configured tenant
  plus organization. It does not duplicate provisioning or authorization logic.
- Empty production databases still require the explicit one-time bootstrap; the
  deploy gate must not synthesize privileged data automatically.
- A fresh hosted deployment remains required after the Production env update.
