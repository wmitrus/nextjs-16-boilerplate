# Organizations First Design

## Objective

- Define the first safe admin GUI slice for `Organizations` so later `Roles` and `RBAC & Policies` work stays aligned with the live repository model.

## Why Organizations First

- The repository already treats `organizations` as the operational unit that owns memberships, roles, policies, and invitations.
- A dedicated `Organizations` surface gives the admin area one stable scope anchor before role or policy mutation is exposed.
- This avoids duplicating organization-selection logic independently inside future `Roles` or `RBAC & Policies` pages.

## Page Goal

- Make organization scope explicit for administrators.
- Show the current organization records available in the active tenant.
- Provide a stable launch point into role, invitation, and later policy management for one organization at a time.

## First Release Scope

- Route: `/admin/organizations`
- Delivery type: server-rendered page with a small client surface only if inline filters or status actions are later needed.
- First release mode: read-only or low-mutation.

## Page Sections

### 1. Organizations Overview

- List organizations for the active tenant.
- Show per organization:
  - name
  - slug if present
  - status
  - created date
  - member count
  - role count
  - pending invitation count

### 2. Active Scope Indicator

- Make clear which tenant the organizations belong to.
- If the app already has an active organization switcher, reflect that organization at the top of the page.
- Future admin pages should derive organization context from this same authority model rather than asking the user to re-interpret scope on every page.

### 3. Organization Detail Actions

- Safe first actions:
  - view details
  - open roles for this organization
  - open invitations for this organization
- Deferred actions:
  - create organization
  - archive organization
  - dissolve organization
  - rename organization

## Data Model Alignment

- Source of truth tables:
  - `organizations`
  - `memberships`
  - `roles`
  - `policies`
  - `invitations`
- Counting and summaries must remain organization-scoped.
- Do not present tenant-wide policy or role operations from this page.

## Server Boundary Rules

- All organization reads and writes must remain server-authoritative.
- UI visibility is not permission.
- Any future mutation must pass the same admin enforcement path already used by `/admin` and `/api/admin/*` routes.

## UX Guardrails

- Use `Organizations`, not `Teams`, in the current admin UI.
- Avoid language that suggests nested teams, team inheritance, or tenant-wide editing.
- Avoid exposing raw policy editing from this page.
- Keep actions contextual: administrators should understand that later role and invitation changes apply to one organization at a time.

## Suggested V1 Route Flow

- `/admin/organizations`
  - list organizations
  - select one organization to manage
- `/admin/roles?organizationId=...`
  - organization-scoped role management
- `/admin/invitations?organizationId=...`
  - organization-scoped invitation management

## Suggested API Shape For Later Implementation

- `GET /api/admin/organizations`
  - list organizations visible in the current admin context
- Optional later routes:
  - `PATCH /api/admin/organizations/:id`
  - `POST /api/admin/organizations`
  - `POST /api/admin/organizations/:id/archive`

## Explicitly Out Of Scope For First Release

- Real `Teams` sub-modeling
- tenant-wide bulk role management
- raw ABAC condition authoring
- nested organization hierarchies
- cross-organization batch invitation flows

## Dependency On Later Phases

- `Roles` depends on Organizations because role lifecycle must be anchored to one organization.
- `RBAC & Policies` depends on Organizations and Roles because policy editing without stable organization and role context has too much blast radius.

## Recommended Next Implementation Step

- Build `/admin/organizations` as the first scope-setting page.
- Keep V1 read-only if needed.
- Use it to drive the next GUI slice: organization-scoped `Roles`.
