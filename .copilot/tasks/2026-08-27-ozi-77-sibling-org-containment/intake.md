# Intake

## Objective

Contain the confirmed sibling-organization authorization bypass without implementing the later tenant/organization redesign.

## Requirements

- Non-platform administrators may access only the organization in the verified server-side access context.
- Explicit env-based platform administrators retain the current ability to access sibling organizations under the active tenant.
- The platform/organization distinction must survive into the Drizzle service call.
- Reads and the organization-status mutation must carry the authorized scope in their SQL predicates.
- Valid foreign UUIDs must produce a non-disclosing not-found result and no mutation.
- Existing UUID parsing, shared API response handling, MFA step-up, and audit behavior must remain intact.

## Scope

- `DrizzleAdminOrganizationsReadService`
- `DrizzleAdminOrganizationsMutationService`
- organization admin `_lib.ts`
- callers under `src/app/api/admin/organizations/**`
- callers under `src/app/admin/organizations/**` and `src/app/admin/invitations/page.tsx`
- focused route tests and companion `*.db.test.ts` files

## Non-Goals

- true tenant memberships or tenant roles
- canonical `AccessContext`
- resolver or `TENANCY_MODE` refactor
- organization creation or quota enforcement
- provider behavior changes
- production deployment or data mutation

## Scenarios

- S1: non-platform owner reads active organization — allowed
- S2: non-platform owner reads sibling organization — not found
- S3: non-platform owner updates active organization status — allowed
- S4: non-platform owner updates sibling organization status — not found and unchanged
- S5: non-platform owner targets another tenant — not found and unchanged
- S6: platform admin reads or updates a sibling under the active tenant — allowed
- S7: platform admin targets another tenant through this active-tenant surface — not found
- S8: malformed route UUID — 400 before service or mutation access

## Acceptance Criteria

- Every organization admin data loader supplies an explicit scope.
- Organization scope never widens through a parent-tenant lookup.
- Platform scope is created only from the server-verified env platform-admin check.
- DB tests prove sibling and cross-tenant denial and unchanged rows.
- Route tests prove non-platform and platform scope construction plus malformed UUID behavior.
- Focused tests, architecture lint, changed-file lint, typecheck, and required phase-close validation pass or are reported precisely.

## Verification Sources

- Linear OZI-77
- live main commit `4d9dbb90e26f17b6eb3cd7c60cc3e791a696bbae`
- SEC-23, SEC-26, SEC-41, and admin step-up rules
- `src/security/core/platform-admin.ts`
- `src/security/core/platform-admin.guard.test.ts`
- live route/service/test files listed in Scope

## Environment Assumptions

- Node 24 and pnpm 11 repository toolchain
- PGlite is available for focused developer feedback
- PostgreSQL test service may be started for final real-DB evidence
- no production credentials or data are required

## Readiness

- [x] canonical Linear issue exists and is In Progress
- [x] exploit path confirmed
- [x] security constraints established
- [x] runtime and architecture placement established
- [x] validation plan established
- [ ] implementation complete
- [ ] validation complete

## Open Questions

- None blocking local containment implementation.
- Production canary and rollout decisions belong to OZI-78.
