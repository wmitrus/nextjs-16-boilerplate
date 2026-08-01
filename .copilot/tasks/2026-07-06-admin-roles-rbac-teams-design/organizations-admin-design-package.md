# Organizations Admin Design Package

## Objective

- Prepare the first full admin design slice for `Organizations` so the later `Roles` and `RBAC & Policies` surfaces are anchored to the live repository authority model.
- Define the page architecture, route flow, API contracts, trust boundaries, and phased implementation order before code changes start.

## Source Of Truth

- `organizations` is the current operational unit in live code.
- Membership, roles, policies, and invitations are organization-owned.
- Active organization selection for AuthJS is already request-scoped through the active-organization cookie flow.
- Current `/admin` access is platform-admin style, enforced server-side.

Relevant code anchors:

- `src/core/contracts/repositories.ts`
- `src/modules/authorization/infrastructure/drizzle/schema.ts`
- `src/app/api/auth/active-org/route.ts`
- `src/modules/provisioning/infrastructure/OrgDbOrganizationResolver.ts`
- `src/app/admin/layout.tsx`
- `src/app/admin/invitations/page.tsx`

## Current-State Findings

### Confirmed

- `organizations` is the stable operational boundary.
- AuthJS already has an organization switch flow via `POST /api/auth/active-org` that verifies membership and sets the active-organization cookie.
- Current admin APIs follow a server-authoritative pattern with `withNodeProvisioning()` and explicit admin checks.

### Drift / Gaps

- The admin UI previously exposed `Teams`, which does not exist as a separate domain model.
- There is no dedicated `organization` resource/action contract in `src/core/contracts/resources-actions.ts` yet.
- The current invitations page derives organization data through a tenant-default shortcut and should later move to request-scoped organization context.

### Design Implication

- The first admin scope page must be `Organizations`.
- It must establish one clear organization context for downstream role and invitation work.
- It must not imply nested-team semantics, tenant-wide bulk editing, or policy authoring.

## Design Goals

- Make organization scope explicit in the admin UI.
- Reuse the existing AuthJS active-organization model instead of inventing a second selector model.
- Give administrators a stable overview page that leads into organization-scoped roles and invitations.
- Keep the first release read-only or low-mutation.
- Preserve the current server-only authority model.

## Non-Goals

- No real `Teams` domain.
- No nested organization hierarchy.
- No tenant-wide bulk role management.
- No raw ABAC condition authoring.
- No large admin-permission redesign in this first slice.

## Authority And Trust Model

### Who Can Access

- V1 remains behind the current `/admin` gate.
- That means access is still controlled by the existing platform-admin style server checks, not by a new org-admin model.

### What Is Trusted

- Trusted:
  - internal DB-backed organization records
  - internal membership checks
  - server-derived active organization context
  - server-side admin enforcement
- Not trusted:
  - client-selected organization IDs without server validation
  - UI labels
  - provider claims as final authority

### Enforcement Rule

- All organization reads and writes must remain server-authoritative.
- UI visibility is never permission.
- Any page or API that accepts `organizationId` must validate it against the current trusted admin context before acting.

## Canonical Information Architecture

## Route Strategy

Preferred canonical shape:

- `/admin/organizations`
- `/admin/organizations/[organizationId]`
- `/admin/organizations/[organizationId]/roles`
- `/admin/organizations/[organizationId]/invitations`

Production-ready companion hub shape:

- `/admin/invitations`

Compatibility notes:

- `/admin/invitations` should not stay as a tenant-default shortcut or first-organization fallback.
- In the long-term design, `/admin/invitations` becomes a real invitations hub with explicit organization selection and deep-links into the nested organization route.
- Future `/admin/roles` should follow the same pattern.
- Query-string organization selection is acceptable only as a temporary compatibility bridge, not the final information architecture.

### Why Nested Routes

- They make scope explicit in the URL.
- They avoid repeating ambiguous org selectors on every page.
- They reflect the real ownership model: roles and invitations belong to one organization.
- They reduce the chance of tenant-wide wording drift.

## Page Design

### Page 1: `/admin/organizations`

Purpose:

- list organizations available in the current admin scope
- show which organization is currently active
- provide the stable launch point into organization-scoped management

V1 page sections:

1. Header
2. Active organization banner
3. Organizations table or card list
4. Contextual actions

V1 fields per organization:

- `id`
- `name`
- `slug`
- `status`
- `createdAt`
- `memberCount`
- `roleCount`
- `pendingInvitationCount`
- `isActive`

V1 actions:

- `View details`
- `Set active`
- `Open roles`
- `Open invitations`

Deferred actions:

- `Rename`
- `Archive`
- `Create organization`
- `Delete / dissolve`

### Page 2: `/admin/organizations/[organizationId]`

Purpose:

- show one organization summary page before mutating subordinate resources

V1 sections:

- organization metadata
- membership summary
- roles summary
- invitation summary
- quick links to roles and invitations

This page may be combined with Page 1 in the first implementation if needed, but it is the preferred steady-state shape.

### Page 3: `/admin/organizations/[organizationId]/roles`

Purpose:

- first mutating page after the organizations scope anchor exists

V1 role constraints:

- organization-scoped only
- no tenant-wide editing
- system-role protection required
- must account for existing memberships and invitations

### Page 4: `/admin/organizations/[organizationId]/invitations`

Purpose:

- later align the existing invitations flow to the canonical organization-scoped route model

### Page 5: `/admin/invitations`

Purpose:

- provide a true top-level Invitations entry in the admin IA
- let administrators choose which organization they are inviting into before role selection and submission
- act as a hub or selector surface, not as a second canonical work surface

Production rules:

- no implicit first-organization selection
- no `DEFAULT_TENANT_ID` fallback as the operational scope anchor
- no page/API split where reads target one org and writes target another
- explicit organization choice must happen before role selection and invitation creation

Preferred steady-state behavior:

1. Open `/admin/invitations`
2. Show organizations in trusted admin scope with invitation counts
3. Let the admin choose one organization explicitly
4. Deep-link to `/admin/organizations/[organizationId]/invitations` for the full operational page

Acceptable alternative:

- keep `/admin/invitations` as a hub page that loads and writes with an explicit organization selector in-place
- this is acceptable only if both reads and writes use the same explicit `organizationId`
- the nested route still remains the canonical page for durable direct links and contextual organization management

## Interaction Flow

### AuthJS Organization Scope Flow

1. Admin opens `/admin/organizations`.
2. Server renders visible organizations.
3. Admin selects `Set active` on one organization.
4. Client calls `POST /api/auth/active-org`.
5. Server validates membership and sets `TENANT_CONTEXT_COOKIE`.
6. UI refreshes and marks the active organization.
7. Admin navigates to `roles` or `invitations` for that organization.

### Invitations Hub Flow

1. Admin opens `/admin/invitations`.
2. Server renders organizations visible in trusted admin scope.
3. Admin explicitly selects the organization to invite into.
4. UI either deep-links to `/admin/organizations/[organizationId]/invitations` or loads that organization's invitation view in-place.
5. Role options and pending invitations are loaded only for that selected organization.
6. Invitation submission writes to an organization-scoped endpoint using the same selected organization.

### Read-Only V1 Flow

1. Open `/admin/organizations`.
2. Review org list and counts.
3. Select a target organization.
4. Open `View details` or downstream management pages.

## API Design

All JSON APIs in this design are expected to use the shared ResponseService
pattern:

- `src/shared/lib/api/response-service.ts`
- `src/shared/lib/api/with-error-handler.ts`

That means:

- success payloads use `createSuccessResponse()`
- structured server errors use `createServerErrorResponse()`
- validation failures use `createValidationErrorResponse()` when field errors are exposed
- normal route handlers are wrapped with `withErrorHandler()` unless the endpoint has a deliberate protocol-specific reason not to

## Phase 1 Delivery Scope

Phase 1 is now considered design-complete with this scope:

- one read-only Organizations landing page at `/admin/organizations`
- one list API at `GET /api/admin/organizations`
- one detail API at `GET /api/admin/organizations/:id`
- compatibility with the existing active-organization AuthJS flow
- no organization mutation endpoints yet

Out of scope for Phase 1 implementation:

- create, rename, archive, or delete organization flows
- role mutation
- invitation mutation redesign
- organization-scoped policy editing

## V1 Read APIs

### `GET /api/admin/organizations`

Purpose:

- return organizations visible in the current admin context for the active tenant

Query parameters:

- `limit` optional, default `50`, clamp `100`
- `offset` optional, default `0`
- `search` optional, max length `200`
- `status` optional, allowlisted (`active`, `archived`) if implemented

Response shape:

```json
{
  "status": "ok",
  "data": {
    "organizations": [
      {
        "id": "uuid",
        "name": "Acme",
        "slug": "acme",
        "status": "active",
        "createdAt": "2026-07-06T00:00:00.000Z",
        "memberCount": 4,
        "roleCount": 2,
        "pendingInvitationCount": 1,
        "isActive": true
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

Authority rule:

- reuse the current `/admin` access model for V1
- do not expose this API to non-admin organization members yet

Implementation responsibility:

- validate query params with Zod at the route boundary
- resolve admin access with the same server-authoritative provisioning path used by sibling admin APIs
- fetch only organizations visible in trusted admin scope
- compute summary counts server-side
- mark `isActive` from the request-scoped active organization context
- return through `createSuccessResponse()`

### `GET /api/admin/organizations/:id`

Purpose:

- return one organization summary for the current admin context

Response shape:

```json
{
  "status": "ok",
  "data": {
    "organization": {
      "id": "uuid",
      "name": "Acme",
      "slug": "acme",
      "status": "active",
      "createdAt": "2026-07-06T00:00:00.000Z"
    },
    "stats": {
      "memberCount": 4,
      "roleCount": 2,
      "pendingInvitationCount": 1,
      "policyCount": 3
    }
  }
}
```

Not-found behavior:

- use `404` when the organization does not exist in the current trusted admin scope
- avoid implying existence outside scope

Implementation responsibility:

- validate `id` as UUID at the route boundary
- resolve admin access before any organization lookup is returned
- fetch summary data only if the organization is in trusted admin scope
- aggregate `memberCount`, `roleCount`, `pendingInvitationCount`, and `policyCount` server-side
- return through `createSuccessResponse()`

## Route Handler Skeleton Expectations

The Phase 1 JSON APIs should follow the same repository shape as existing admin APIs:

1. `withErrorHandler(...)`
2. `withNodeProvisioning(...)`
3. explicit admin access check
4. Zod input validation
5. server-side data shaping
6. `createSuccessResponse(...)` or structured error helper

This is a design constraint, not only a coding preference.

## Response Contract Shapes

### List Success Envelope

```json
{
  "status": "ok",
  "data": {
    "organizations": [
      {
        "id": "uuid",
        "name": "Acme",
        "slug": "acme",
        "status": "active",
        "createdAt": "2026-07-06T00:00:00.000Z",
        "memberCount": 4,
        "roleCount": 2,
        "pendingInvitationCount": 1,
        "isActive": true
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### Detail Success Envelope

```json
{
  "status": "ok",
  "data": {
    "organization": {
      "id": "uuid",
      "name": "Acme",
      "slug": "acme",
      "status": "active",
      "createdAt": "2026-07-06T00:00:00.000Z"
    },
    "stats": {
      "memberCount": 4,
      "roleCount": 2,
      "pendingInvitationCount": 1,
      "policyCount": 3
    }
  }
}
```

### Validation Error Envelope

Expected repository-style shape via `createValidationErrorResponse()`:

```json
{
  "status": "error",
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "fieldErrors": {
        "id": ["Invalid uuid"]
      }
    }
  }
}
```

### Forbidden Error Envelope

Expected repository-style shape via `createServerErrorResponse()` in the current admin pattern:

```json
{
  "status": "error",
  "error": {
    "message": "Forbidden",
    "code": "FORBIDDEN"
  }
}
```

### Not Found Error Envelope

Expected repository-style shape when the target org is outside trusted scope or absent:

```json
{
  "status": "error",
  "error": {
    "message": "Organization not found",
    "code": "NOT_FOUND"
  }
}
```

## Phase 1 Error-Code Matrix

### `GET /api/admin/organizations`

| Condition                                        | HTTP  | Response Helper                   | Notes                                        |
| ------------------------------------------------ | ----- | --------------------------------- | -------------------------------------------- |
| admin access granted, valid query                | `200` | `createSuccessResponse()`         | returns paginated organizations list         |
| unauthenticated or non-admin caller              | `403` | `createServerErrorResponse()`     | stay aligned with current admin API behavior |
| invalid `limit`, `offset`, `search`, or `status` | `400` | `createValidationErrorResponse()` | route-boundary validation                    |
| unexpected repository/service failure            | `500` | `createServerErrorResponse()`     | handled through `withErrorHandler()`         |

### `GET /api/admin/organizations/:id`

| Condition                                  | HTTP  | Response Helper                   | Notes                                |
| ------------------------------------------ | ----- | --------------------------------- | ------------------------------------ |
| admin access granted, org in trusted scope | `200` | `createSuccessResponse()`         | returns organization summary         |
| unauthenticated or non-admin caller        | `403` | `createServerErrorResponse()`     | aligned with existing admin APIs     |
| invalid UUID parameter                     | `400` | `createValidationErrorResponse()` | route-boundary validation            |
| org missing or outside trusted admin scope | `404` | `createServerErrorResponse()`     | do not leak existence outside scope  |
| unexpected repository/service failure      | `500` | `createServerErrorResponse()`     | handled through `withErrorHandler()` |

## Page-Level Server Responsibilities

### `/admin/organizations`

- stay behind the existing `/admin` server gate
- avoid embedding authorization rules in client components
- request data from the Phase 1 list API or equivalent server-owned loader path
- render active organization state from server-derived context
- keep table/card data presentational; no client-owned business logic

### `/admin/organizations/[organizationId]`

- preferred steady-state shape, but optional in the first code drop
- if implemented in Phase 1, it must remain summary-only
- should consume the detail contract above without redefining scope in the client

## Data Contract Notes

- `memberCount` counts current memberships only
- `pendingInvitationCount` excludes accepted or revoked invitations
- `roleCount` counts roles visible in the current organization scope, including protected system roles unless product copy later decides otherwise
- `isActive` is derived from the current trusted active-organization cookie context, not from the client URL alone

## Implementation Readiness Notes

Before coding starts, the implementing agent should treat the following as fixed for Phase 1:

- ResponseService is mandatory for these JSON APIs
- the existing `/admin` authority model is reused
- no new org-admin authorization tier is introduced
- no mutation endpoint is part of the first landing slice
- nested organization routes remain the canonical long-term information architecture even if the first implementation lands only the list page

## Deferred Mutation APIs

These are intentionally deferred from the first implementation:

- `POST /api/admin/organizations`
- `PATCH /api/admin/organizations/:id`
- `POST /api/admin/organizations/:id/archive`
- `POST /api/admin/organizations/:id/activate`

Reason:

- create/archive/rename semantics need a stronger contract than the first read-only scope-setting slice

## API Implementation Notes

- Prefer `withNodeProvisioning()` for admin APIs so access state is resolved consistently.
- Reuse the established admin-access helper pattern used by `/api/admin/users` and `/api/admin/invitations`.
- Avoid direct client trust in `organizationId`; validate against the current admin scope on the server.
- Keep response shapes aligned with existing admin APIs: `status`, `data`, and explicit pagination fields.
- Do not open-code raw `NextResponse.json(...)` envelopes for these V1 JSON APIs; use the shared ResponseService helpers unless a protocol-specific exception is documented.

## Authorization Contract Recommendation

### V1

- Reuse the current `/admin` gate and existing platform-admin style checks.
- Do not introduce a new org-admin permission model in the first Organizations slice.

### Follow-Up

- Consider adding dedicated organization-scoped resources/actions later if the admin surface expands materially.
- Do not add them preemptively in the first read-only slice.

## Data Access Requirements

V1 list page needs:

- organizations in trusted scope
- counts for:
  - memberships
  - roles
  - pending invitations
- active organization marker from request-scoped tenant context cookie

Data-shaping rule:

- build summaries server-side
- do not push cross-table joining semantics into the client

## Compatibility And Migration Notes

- Keep the newly renamed admin card pointing to `/admin/organizations`.
- Existing `/admin/invitations` may stay live short-term, but later should either:
  - redirect from current active organization context to the canonical nested route, or
  - remain as a compatibility alias that makes scope explicit in-page
- Future role management should launch under the organization-scoped nested route rather than a global `/admin/roles` with implicit scope.

## Risks

- If V1 tries to include organization mutation immediately, the scope-setting page becomes a high-blast-radius write surface too early.
- If V1 uses env-default tenant assumptions instead of request-scoped org context, AuthJS multi-organization behavior will drift from the live runtime model.
- If V1 keeps flat global admin routes for downstream resources, the UI will reintroduce ambiguity that the Organizations page is meant to remove.

## Validation Expectations

For future implementation work, minimum proof should include:

- route/page rendering tests for `/admin/organizations`
- focused API tests for list and detail handlers
- active-organization flow compatibility proof with `POST /api/auth/active-org`
- no regression to current `/admin` guard behavior

## Recommended Next Implementation Step

- Implement `/admin/organizations` first as a read-only scope-setting page.
- Add `GET /api/admin/organizations` as the first supporting API.
- Keep V1 behind the existing `/admin` authority model.
- After this lands, implement organization-scoped `Roles` under the nested route model.
