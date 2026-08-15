# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-14-authjs-vercel-prebuilt-root-cause-audit`
- Scope: Production AuthJS bootstrap, single-tenant context, and deployment-time
  tenant readiness.
- Status: IMPLEMENTED LOCALLY; fresh hosted deployment pending.
- Last updated: 2026-08-15.

## Current-State Findings

- AuthJS correctly established the signed-in identity and the credentials
  callback returned `200`.
- `/auth/bootstrap/start` correctly rejected provisioning with
  `TENANT_NOT_PROVISIONED`; it did not attach the user to an arbitrary tenant.
- Production DB has one complete tenant boundary: one tenant, one organization,
  one membership, two roles, and ten policies.
- Production Vercel `DEFAULT_TENANT_ID` identified a different UUID. The issue
  was configuration/data drift, not authentication, authorization, or schema
  migration failure.
- Production `DEFAULT_TENANT_ID` was aligned to the existing provisioned tenant
  after validating that exactly one tenant and at least one organization exist.

## Trust Boundary Assessment

- Identity is established by the AuthJS credentials/session boundary.
- The server derives single-tenant context only from server-side
  `DEFAULT_TENANT_ID`; no client tenant identifier is trusted.
- Provisioning resolves the configured tenant against the database before
  membership or authorization state is used.
- The new readiness checker is read-only and uses parameterized Drizzle
  predicates. It does not expose credentials, user data, or tenant UUIDs.

## Security Decisions

- Preserve fail-closed `TenantNotProvisionedError` behavior.
- Align config to the existing tenant; do not create a duplicate tenant or move
  auth/tenant decisions into the client.
- Keep production bootstrap manual and operator-controlled.
- Run the readiness check after migrations and before production upload.
- Do not run this GitHub-side check for Preview because Neon chooses the
  branch-scoped DB during the hosted source deployment.

## Validation And Handoff

- Pure contract tests cover aligned, mismatched, empty, incomplete, non-single,
  and missing-mode states.
- Production env was re-pulled after correction and the read-only checker
  returned `Ready`.
- A new deployment is still required because Vercel env changes do not alter an
  already running deployment.
