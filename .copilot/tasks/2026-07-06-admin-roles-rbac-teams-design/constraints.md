# Constraints

## Confirmed Repository Constraints

- Authorization decisions must remain DB-authoritative and server-enforced.
- Edge is not the place for DB-backed role or policy decisions.
- Current canonical tenant DB role model is `owner` and `member`.
- Roles, memberships, and policies are organization-scoped in the current schema.
- Admin access already hinges on `SECURITY_MANAGE_POLICIES` plus bootstrap fallback rules.
- `shared/*` and delivery layers must not absorb domain or policy logic.
- Normal JSON App Router APIs must use the shared ResponseService pattern unless there is an explicit protocol-specific exception.

## Architecture Constraints

- Use one integrated design package for `Roles`, `RBAC & Policies`, and `Teams`; implementation may still be phased.
- Keep admin UI thin. Domain rules remain in authorization, provisioning, and invitation services rather than delivery code.
- Bind role and policy management to organization context, not tenant-wide free-form editing.
- Treat current admin card text as non-authoritative UI copy because it drifts from the live schema and contracts.
- For production-ready Organizations reads, keep one shared server-side read service in the owning module and let server pages and JSON APIs act as separate delivery adapters over it.
- The canonical Roles and RBAC slices remain nested under `/admin/organizations/[organizationId]/*`, even when only read-only visibility is exposed.
- Roles and RBAC flat hub entry points may route users through the Organizations surface, but Invitations should keep a distinct top-level admin entry because invitation operations are a valid first-class business task.
- The top-level Invitations page must be a real hub with explicit organization selection, not a tenant-default shortcut or first-organization fallback.

## Security And Trust Constraints

- Server-side enforcement remains mandatory for all admin operations; UI visibility is never authority.
- Role assignment is coupled to membership and invitation flows; GUI write paths must preserve current organization ownership checks.
- `RBAC & Policies` is the highest-blast-radius surface and must not be the first page shipped.
- `Roles` can be the first mutating page only if system roles (`owner`, `member`) and invite/member side effects are explicitly guarded.
- Any `organizationId` accepted by a page or API must be validated in trusted server scope before data is returned.
- Custom role creation must reject reserved system-role names and prevent case-insensitive duplicate names within one organization.
- Custom role rename must preserve the same reserved-name and duplicate-name protections and must never allow system-role mutation.
- Custom role delete must be blocked when the role is system-owned, assigned to memberships, or referenced by pending invitations.
- Early RBAC mutation should stay constrained to organization-scoped role policies with known resources/actions and no free-form conditions.
- Policy deletion must preserve the baseline owner policy that grants `security:manage_policies`, to reduce accidental admin self-lockout.
- Invitation reads and writes must share the same explicit organization scope anchor; mixing tenant-default page scope with active-org write scope is banned.

## API Contract Constraints

- For the Phase 1 Organizations slice, `GET /api/admin/organizations` and `GET /api/admin/organizations/:id` are the only approved JSON APIs.
- These APIs must use `src/shared/lib/api/response-service.ts` together with `src/shared/lib/api/with-error-handler.ts`.
- Ad hoc `NextResponse.json(...)` envelopes are not allowed for these endpoints.
- Query and path params must be validated at the route boundary.
- Not-found responses must not leak whether an organization exists outside trusted admin scope.

## Decision

- Preferred method: integrated design pass plus staged GUI implementation.
- Rejected: three separate page-by-page designs with loose coordination.
- Rejected: one large merged implementation slice by default.

## Open Design Questions

- Whether `Teams` should be treated as near-term organization management or as a new structural concept.
- Whether custom roles are truly in scope for the first admin release.
- Whether early policy management should be constrained to presets/templates rather than raw authoring.
