# OZI-71 — Phase 1 Tenant/Organization Architecture Decision

Architecture only. No application code, schema, migration, remote operation,
Production access, or Linear mutation was performed to produce this document.

## 1. Objective

Decide, from repository evidence, whether tenant/organization topology
should remain governed by the global `TENANCY_MODE=single|personal|org`
switch or become data-driven from actual tenant/organization/membership
rows — and produce the canonical Phase 1 domain model, the separated
`AccessContext` / per-operation `DataScope` contract, security invariants,
and an ordered, non-executed implementation plan.

Phase 0 containment (`AdminOrganizationsScope`, OZI-77) is treated as the
safe interim baseline and is not re-litigated.

## 2. Authoritative evidence

- `docs/other/tenants-vs-orgs.md`, `docs/other/orgs-and-clerk.md` — researched
  (Microsoft Entra, Auth0, Clerk, Slack, GitHub, Atlassian) prior art:
  tenant = isolation/billing/compliance boundary; organization = business
  unit/membership container; Clerk has no native parent-tenant/nested-org
  primitive — a higher tenant level is always the application's own entity.
- OZI-71 description — approved worked example (EduGroup = tenant, Schools =
  organizations = Clerk orgs); confirms self-service org creation is a real
  product requirement partially wired for Clerk (`WorkspaceSwitcher`
  `createOrganizationMode="modal"`) but absent for AuthJS.
- OZI-67 — supersedes the earlier A/B framing with the approved **Option C**
  direction: "one canonical two-ID tenant/organization domain, one
  provider-neutral access-context pipeline, provider-specific selection
  adapters, and product policies instead of security modes." Confirms the
  live sibling-organization defect that motivated Phase 0.
- OZI-68 — divergent org-resolution queries (`SingleTenantResolver` ordered
  vs. `DrizzleProvisioningService.resolveOrganization` single-mode branch
  unordered) — confirmed still live in current code (no `ORDER BY` in the
  single-mode branch, `DrizzleProvisioningService.ts:911-933`).
- OZI-69 — dead "Set active organization" UI under `single` mode — confirmed
  still live (`SingleTenantResolver` ignores the active-org cookie
  entirely).
- OZI-70 — no enforcement of one-org-per-tenant under `single` mode —
  confirmed still live; `tenant_attributes.maxOrganizations` exists in
  schema but nothing reads it yet.
- OZI-72 — superseded proposal; its concrete findings (self-service-org
  provider-parity gap, `tenant_attributes.maxOrganizations` as the natural
  per-tenant quota surface) are reused below; its "collapse straight onto
  org+db" conclusion is not adopted as-is (see Alternative B).
- OZI-74/75/76/77/78/79 — Phase 0 evidence: sibling-org containment
  (`AdminOrganizationsScope`), full admin-surface scope audit (`matrix.md`),
  read-only topology/identifier inventory (local + Production), Production
  validation. Treated as the safe interim baseline throughout.
- Live code read directly in this session: `src/core/contracts/tenancy.ts`,
  `src/core/contracts/primitives.ts`, `src/core/contracts/identity.ts`,
  `src/core/env.ts`, `src/modules/provisioning/infrastructure/{SingleTenantResolver,PersonalOrganizationResolver,OrgDbOrganizationResolver,ProviderOrganizationResolver}.ts`,
  `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`,
  `src/modules/authorization/infrastructure/drizzle/schema.ts`,
  `src/modules/auth/infrastructure/drizzle/schema.ts`,
  `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.ts`,
  `src/modules/billing/infrastructure/drizzle/schema.ts`,
  `src/modules/feature-flags/infrastructure/drizzle/schema.ts`,
  `src/modules/audit-log/infrastructure/drizzle/schema.ts`,
  `src/core/db/schema/references.ts`, `src/security/core/platform-admin.ts`,
  `src/modules/authorization/domain/AdminOrganizationsScope.ts`,
  `src/app/api/admin/organizations/_lib.ts`.

## 3. Current-state problems (confirmed live, not historical-only)

1. **Identity collapse**: all four `TenantResolver` implementations
   (`SingleTenantResolver`, `PersonalOrganizationResolver`,
   `OrgDbOrganizationResolver`, `ProviderOrganizationResolver`) return
   `{ organizationId: X, tenantId: X }` — the same value in both fields,
   every time, unconditionally. `TenantContext`'s own doc comment names this
   as deliberate "Phase 2+" backward compatibility. `TenantId`/
   `OrganizationId`/`SubjectId` are all `type X = string` — no nominal
   distinction, so a swapped parameter type-checks.
2. **OZI-68 is still live**: `resolveOrganization`'s `tenancyMode === 'single'`
   branch (`DrizzleProvisioningService.ts`) still runs
   `SELECT id FROM organizations WHERE tenant_id = $1 LIMIT 1` with no
   `ORDER BY`, while `SingleTenantResolver`'s injected lookup uses
   `ORDER BY id ASC`. Two organizations under one tenant can still diverge.
3. **OZI-70 is still live**: `tenant_attributes.maxOrganizations` exists in
   schema (default `1`) but no code path reads it before creating an
   organization. "Single organization" is still true only by accident.
4. **`DEFAULT_ORG_ID` was never implemented**: `grep` across `src/` finds
   zero references. The 2026-04-17 design's specified fix
   (`FIXED organization (DEFAULT_ORG_ID...)`) is historical intent only, not
   live authority — nothing to retire in code, only to avoid introducing now.
5. **No JIT provisioning for Clerk self-service organizations**: Clerk's
   `WorkspaceSwitcher` passes `createOrganizationMode="modal"` (native
   Clerk-side org creation), but `DrizzleInternalIdentityLookup.
   findInternalOrganizationId` is SELECT-only — nothing inserts a
   corresponding `organizations` + `auth_organization_identities` row when a
   user creates a Clerk organization. A user who does this gets
   `TenantNotProvisionedError` from `ProviderOrganizationResolver`. This is a
   plausible, though unconfirmed, explanation for OZI-79's production
   anomaly ("one organization has no provider-organization mapping").
6. **Ambiguous `tenant_id` columns actually hold organization data**:
   `feature_flags.tenant_id`, `audit_log_settings.tenant_id`,
   `audit_events.tenant_id` are all `text`, not FK — populated from whatever
   `TenantContext.tenantId` resolves to, which (per #1) is always the
   organization UUID. OZI-75 confirmed 100% of populated
   `audit_events.tenant_id` values in local `dev-db` match `organizations.id`
   and none match `tenants.id`. These are organization-scoped columns
   wearing a `tenant_id` name, not a future risk — a present naming/semantic
   defect.
7. **`waitlist_entries` carries two nullable FKs** (`organizationId`,
   `tenantId`), but code never reads/writes `tenantId` at all
   (`CreateWaitlistEntryData` has no `tenantId` field). OZI-75's local
   dry-run signal (`0` populated rows) is consistent with, but does not
   prove, a dead column.
8. **No tenant-scoped admin/role concept exists.** Every "admin" surface
   today is either organization-scoped (ordinary membership + role) or
   env-based platform-admin (`isEnvBasedPlatformAdmin`); nothing sits
   between them. OZI-77's interim `AdminOrganizationsScope`
   (`organization` | `active-tenant`) is a correct Phase 0 containment shape
   but is explicitly not the canonical model (Architecture Guard: "GO WITH
   FOLLOW-UP").

## 4. Alternatives considered

| Dimension | A — Keep `TENANCY_MODE`, repair branches | B — Fully data-driven, no policy flags | **C — Data-driven topology + narrow capability/policy flags (chosen)** |
|---|---|---|---|
| Correctness | Poor — permanently encodes the tenantId/organizationId collapse across 3 divergent resolvers | Good for topology; no seam for legitimate bootstrap policy | Best — topology always from data; policy flags are named, narrow, never gate authorization |
| Security | Preserves the SEC-26/41-shaped risk class structurally (a mode branch is exactly what silently diverges) | Good, but bootstrap-policy decisions get pushed into ad-hoc per-route logic if not named (the actual root cause of OZI-68) | Best — every operation's `DataScope` is derived server-side per request from identity + authoritative DB relationships; policy flags affect only what gets *created* at signup, never what gets *authorized* |
| Extensibility | Poor — a 4th topology shape needs a 4th mode | Good for topology; awkward for a real per-deployment product decision (e.g. auto-provision personal org at signup, yes/no) | Best — a 5th topology shape needs zero code; a new bootstrap policy is one more named flag |
| Clerk/AuthJS compatibility | Forces AuthJS's `db` path to keep pretending to be one of three "modes" | Good | Best — both providers plug into one mechanism; only identity-resolution adapters differ (already true today) |
| Operational complexity | Low short-term, but a single deployment can never mix topologies (contradicts the 4-shape requirement outright) | Low | Low — same as B plus a couple of named, single-purpose flags |
| Migration complexity | Lowest (small patches) | Moderate | Moderate (same schema work as B), incrementally shippable |
| Supports all 4 topology shapes | **Fails** — one env var picks one mode for the whole deployment | Yes | Yes, natively |
| Risk of tenantId/organizationId collapse | Highest — baked into every resolver by design | Low, if the actor/scope split is built correctly | Lowest — branded types + one resolver + per-operation `DataScope` derivation + explicit quota policy leave no collapse seam |
| Long-term maintenance cost | High — three parallel resolvers forever | Low-moderate, but re-invites an unnamed config decision later anyway | Lowest — one mechanism, a couple of named policy toggles instead of three divergent security modes |

**Decision: C.** This is the same direction OZI-67 already approved
("Option C"). It is the only alternative that cleanly separates "topology
fact" (always data — FK rows and memberships) from "deployment
capability/policy" (a few narrow, explicitly-non-security flags, e.g. the
existing `tenant_attributes.maxOrganizations`) without perpetuating the
tenantId/organizationId collapse (A's defect) or silently re-inventing
per-tenant flags as ad-hoc code branches (B's real weakness, and the actual
shape of the OZI-68 bug).

## 5. Architecture decision

Retire `TENANCY_MODE` as a runtime security-mode switch. Tenant→organization
is a **1:N ownership relationship** (`organizations.tenant_id NOT NULL` FK to
`tenants.id`): every organization belongs to exactly one tenant. It is not,
and must not become, many-to-many. All four required deployment/data shapes
are naturally represented by that same single 1:N FK model, with no schema
change:

1. one tenant → exactly one organization,
2. one tenant → many organizations,
3. many tenants → exactly one organization per tenant,
4. many tenants → many organizations per tenant.

Which shape a given deployment is in is a fact about how many rows exist,
derived entirely from `organizations.tenant_id` FK rows and `memberships`
rows — never from a global flag.

A user may hold memberships in organizations belonging to different tenants.
That is a property of the user's membership set, not of the
tenant↔organization relationship, and does not make it many-to-many.

`organization.tenantId` is mandatory and immutable ownership identity: an
organization's owning tenant is fixed at creation and never changes unless a
future, separately designed and separately authorized reparenting operation
explicitly exists. No `tenant_organizations` (or equivalent) join table is
introduced.

What legitimately remains as configuration is narrow, explicitly
non-security **bootstrap/capability policy**: per-tenant
`maxOrganizations`/`maxUsers` (already in `tenant_attributes`), and a
bootstrap-policy choice for brand-new signups (does first login
auto-provision a personal organization — a product decision, not a
resolver class). `AUTH_PROVIDER` remains deployment configuration for a
legitimate reason (which identity provider is wired), unrelated to topology.

## 6. Canonical domain model

- **`tenantId`** (branded `TenantId`) — top-level isolation/billing/
  compliance/central-audit boundary. Never null for an organization (schema
  already enforces `organizations.tenant_id NOT NULL`). May be absent only
  for genuinely platform-global resources/operations (e.g. waitlist before
  organization assignment, platform-global feature-flag/audit defaults where
  `NULL` = global default).
- **`organizationId`** (branded `OrganizationId`) — operational unit /
  membership container; users, roles, invitations, ordinary resource
  ownership; maps 1:1 to a Clerk Organization. Belongs to exactly one tenant
  (`organizations.tenant_id NOT NULL`); that owning `tenantId` is mandatory
  and immutable ownership identity — set at creation, never reassigned
  absent a future, separately designed and authorized reparenting operation.
  Never null for organization-owned resources (roles, memberships,
  invitations). Null only for the explicit, documented exception: a
  genuinely global/system policy row (`policies.organizationId IS NULL`) — a
  case to decide, not remove, since OZI-75 found zero such rows locally and
  its intent is undecided (§13).
- **Tenant↔organization cardinality** — strictly 1:N (one tenant owns many
  organizations; one organization has exactly one tenant). Not many-to-many.
  No `tenant_organizations` join table. A user's memberships spanning
  organizations in more than one tenant is a fact about that user, not about
  this relationship.
- **`userId`** (branded `UserId`) — internal app identity, distinct from any
  external provider identity (`auth_user_identities.externalUserId`). Never
  null for an authenticated action. A system/anonymous action is its own
  explicit classification, never a null `userId` masquerading as "nobody."

These three types must be structurally distinct (branded/nominal types), not
`type X = string` aliases as today — this is what makes an accidental
`organizationId`-for-`tenantId` substitution a compile error instead of a
silent bug.

## 7. AccessContext vs. operation DataScope

Two distinct concepts, deliberately kept separate. An actor does **not**
permanently "own" one authorization scope; scope is derived per
operation/resource class.

- **`AccessContext`** — the authenticated, server-verified actor and request
  context. Carries who the caller is and their verified working-context
  selection. It does **not** carry a `DataScope`.
- **`DataScope`** — the authoritative scope for *one* operation against
  *one* resource class, derived server-side at the point of use from
  `AccessContext` + authoritative DB relationships + explicit authority
  checks.

This replaces `TenantContext`'s tenantId≡organizationId collapse and
supersedes OZI-77's interim `AdminOrganizationsScope` as the canonical
shape. The interim shape's *enforcement pattern* — scope AND-ed into the
same SQL predicate as the resource id — is kept and generalized, not
discarded.

Architecture contract (not implementation code — the exact TypeScript is
settled in Slice 1):

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
type TenantId = Brand<string, 'TenantId'>;
type OrganizationId = Brand<string, 'OrganizationId'>;
type UserId = Brand<string, 'UserId'>;

interface AccessContext {
  readonly userId: UserId;
  readonly activeOrganization:
    | { organizationId: OrganizationId; tenantId: TenantId }
    | null;
  readonly isPlatformAdmin: boolean;
}

type DataScope =
  | { kind: 'organization'; organizationId: OrganizationId; tenantId: TenantId }
  | { kind: 'tenant'; tenantId: TenantId }
  | { kind: 'platform-global' };
```

### `AccessContext` derivation

- `userId` — resolved server-side from the authenticated session / verified
  provider identity; never from a client-supplied header/body/query field.
- `activeOrganization` — a verified working-context selection (cookie/header
  supplies a *candidate* organization id; it is accepted only after
  server-side membership/authority verification in the same request, exactly
  as `OrgDbOrganizationResolver` does today). When present it carries **both**
  the `organizationId` and its authoritative parent `tenantId`, loaded from
  the `organizations` row — the two ids always travel together, never one
  without the other. Selecting an organization is a working-context choice
  only; it grants no tenant-level authority. A user may be a member of
  organizations in different tenants, but each selected organization still
  belongs to exactly one tenant.
- `isPlatformAdmin` — server-verified only (`isEnvBasedPlatformAdmin` today,
  a DB-backed platform-admin role later); never client-derived. It is an
  actor capability, not a scope.

`AccessContext` intentionally does **not** eagerly carry a
`membershipOrganizationIds` collection. Membership/authority is resolved
through authoritative services/repositories as part of `DataScope`
derivation for the specific operation that needs it. If an implementation
later finds a concrete need to memoize such a collection on the context, it
must remain: (a) derived server-side; (b) never client-controlled; (c)
insufficient on its own to grant tenant scope; (d) paired with an
organization→tenant ownership lookup from authoritative DB relationships,
never an assumed parent.

### `DataScope` derivation, per kind

- **`organization`** — the active or requested organization identity is
  verified server-side; the caller's membership/authority in that
  organization is verified; the organization→tenant relationship is loaded
  from authoritative DB data (`organizations.tenant_id`); both ids travel
  together in the scope. SQL carries the organization predicate AND-ed with
  the requested resource id in the same statement, and — where useful for
  defense-in-depth — the tenant relation as well.
- **`tenant`** — MUST NOT be inferred merely because the caller belongs to
  one or more organizations under that tenant. It requires an explicitly
  defined tenant-level authority, OR an explicitly scoped platform-admin
  operation. Because tenant-level roles/memberships do not exist in the
  current schema (§3.8, §13), an ordinary user must never accidentally
  receive `tenant` scope; until such a concept is deliberately designed and
  built, the only producer of `tenant` scope is an explicitly scoped
  platform-admin operation.
- **`platform-global`** — only for operations explicitly classified as
  platform-global (e.g. the waitlist, §14). Platform-admin capability alone
  does not turn every repository call into an unbounded operation: even a
  platform admin's operation still derives a concrete `organization` or
  `tenant` scope (re-resolved from the database at the moment of use, the
  "never trust a cached parent" rule OZI-77's `active-tenant` resolution
  already applies) unless the operation is one of the explicitly classified
  platform-global set.

### Cross-cutting rules

- `DataScope` is always derived, never accepted as input. A route/service
  receives a *requested resource id* (e.g. an `organizationId` route param)
  and checks it against the derived scope — the requested id never becomes
  the scope.
- Client-supplied resource IDs never become authority: every SQL
  read/mutation binds the derived scope's predicate AND-ed with the
  requested id in the same statement (OZI-77's proven pattern, generalized
  to every resource family, not just `organizations`).

## 8. Provider mapping

- `auth_organization_identities(provider, externalOrgId) -> organizationId`
  is canonical: a provider organization identity maps to an internal
  **organization**, never a tenant (Clerk has no parent-tenant primitive —
  confirmed in `orgs-and-clerk.md` and unchanged in Clerk's current docs
  posture).
- `auth_user_identities(provider, externalUserId) -> userId` maps to a user,
  never any org/tenant.
- Core domain types (`TenantId`, `OrganizationId`, `AccessContext`) never
  import Clerk SDK types — confirmed already true (`core/contracts` has zero
  Clerk imports); provider adapters (`ProviderOrganizationResolver`, Clerk
  webhooks/JIT provisioning if built) translate at the edge only.
- AuthJS reaches equivalent semantics through `TENANT_CONTEXT_SOURCE=db`
  (app-level active-organization selection + verified membership) — this is
  AuthJS's real, first-class equivalent, not a pretend "AuthJS provider
  organization." Do not build a fake provider-org primitive for AuthJS.
- OZI-79's two Production anomalies are Phase 1 inputs, not repaired here:
  (a) one organization with no provider mapping row — plausibly the
  self-service-JIT gap confirmed in §3.5, not yet proven as the cause;
  (b) one user with two rows for the same provider — a data-hygiene
  question (which row is canonical) requiring investigation before any
  code decision.

## 9. Resource ownership model

| Ownership | Tables (confirmed live schema) | Enforcement |
|---|---|---|
| Platform-owned | `users`, `auth_user_identities`, `user_credentials`, `password_reset_tokens`, `email_verification_tokens`, `user_mfa_totp`, `user_mfa_recovery_codes`, `rate_limit_counters`, `waitlist_entries` (platform-global by design, §14) | keyed by `userId` or fully unscoped by design; platform-admin-only mutation paths |
| Tenant-owned | `tenants`, `tenant_attributes` (`maxUsers`, `maxOrganizations`, `plan`, `contractType`, `features`), `subscriptions` | SQL predicate on `tenantId` |
| Organization-owned | `organizations` (has the `tenantId` FK itself), `roles`, `memberships`, `invitations`, `auth_organization_identities` | SQL predicate on `organizationId`, AND-ed with the requested resource id in the same statement (OZI-77 pattern) |
| Ambiguous — Phase 1 decision required | `policies.organizationId` (nullable — global/system policy semantics undecided), `feature_flags.tenant_id`, `audit_log_settings.tenant_id`, `audit_events.tenant_id` (all `text`, observed-organization-scoped in practice), `waitlist_entries.tenant_id` (nullable, never read/written by code) | see §13/§14 |

Authorization and resource scope meet at the database statement: every
repository method for a tenant- or organization-owned table takes a
per-operation `DataScope` (derived server-side from `AccessContext` for that
call), not a raw id, and constructs its `WHERE` clause from that scope
AND-ed with the requested id — never a post-fetch application-layer filter.

## 10. TENANCY_MODE disposition

**RETIRE** the env var as a runtime resolver-selection switch. Per value:

| Value | What it currently controls | Disposition |
|---|---|---|
| `single` | Fixed default tenant/org lookup at both request-time (`SingleTenantResolver`, ordered) and provisioning-time (`DrizzleProvisioningService`, unordered — OZI-68) | **Disappears as a resolver.** Its only legitimate behavior (a fixed bootstrap tenant for local/dev/first-deploy convenience) becomes a **seed-time** concern, not a per-request security branch. The org-count guarantee it never enforced becomes the uniform `tenant_attributes.maxOrganizations` quota check (subsumes OZI-70), applied at every organization-creation call site regardless of deployment. |
| `personal` | Auto-creates/looks up one organization per user | **Moves into bootstrap policy.** "Does first login auto-provision a personal organization" becomes a signup-time product decision made once, not a resolver class re-evaluated per request. Once a personal org + membership row exist, the single remaining `org`+`db` mechanism handles it identically to any other organization. |
| `org` | Real membership rows + verified active-org selection (`db`), or provider claim (`provider`) | **Becomes the only runtime mechanism**, not "the surviving mode." There is no longer a mode branch — every deployment resolves the same way; `db` vs. `provider` remains a genuine, orthogonal **provider configuration** axis (which identity source supplies the active-organization claim), not a topology mode. |

Net effect: the 3-way `TENANCY_MODE` branch disappears from the request
path entirely. What were `single`/`personal` become named bootstrap-policy
inputs to signup/seed flows, evaluated once at provisioning time, never
re-branched on every authorization check.

## 11. DEFAULT_TENANT_ID / DEFAULT_ORG_ID disposition

- **`DEFAULT_TENANT_ID`**: **transitional compatibility mechanism today →
  retired from the request-resolution path** once §10's resolver retirement
  lands. Legitimate residual use: a **seed-script parameter** for
  local/first-deploy convenience (some tenant must exist to attach the first
  organization to) — never read at request time once no resolver depends on
  it.
- **`DEFAULT_ORG_ID`**: **not live authority** — confirmed zero references
  anywhere in `src/`. It was specified in the 2026-04-17 design
  (`architecture-design.md`) but never implemented. Classification: a
  **historical proposal that should not be introduced now.** The bootstrap
  need it would have served (which org a freshly seeded user lands in) is
  covered by the personal-org-creation-at-signup policy (§10) or the seed
  script directly creating one deterministic organization — not a new
  hidden global read at request time.

Neither may become hidden runtime authority: once §10 lands, no
authorization decision reads either variable.

## 12. OZI-68 / OZI-69 / OZI-70 disposition

- **OZI-68** (divergent org-resolution queries): **superseded by OZI-71.**
  Once `single`/`personal` resolvers are retired (§10), the class of bug
  (two different "pick the org for this tenant" queries) cannot exist — the
  one remaining mechanism (`org`+`db`, membership + verified active-org) is
  already correct today. Do not implement OZI-68's originally scoped
  "unify the two queries" fix as a standalone patch.
- **OZI-69** ("Set active organization" dead UI under `single`): **superseded
  by OZI-71.** Once topology is data-driven, the switcher's visibility
  becomes purely "does this user have ≥2 memberships" (the pattern
  `AuthJsWorkspaceSwitcher` already uses elsewhere) — there is no
  `TENANCY_MODE` left to gate on. The remaining work — wiring
  `OrganizationsClient`'s admin "Set active" control onto real membership
  data instead of `SingleTenantResolver`'s output — becomes Phase 1
  implementation Slice 4/5 below, not the originally scoped mode-gate fix.
- **OZI-70** (no one-org-per-tenant enforcement): **convert into a Phase 1
  implementation slice** (Slice 6, "organization-creation quota
  enforcement"), generalized beyond `single` mode: enforce
  `tenant_attributes.maxOrganizations` at the one organization-creation
  service, used by every creation entry point (admin, future self-service,
  future JIT webhook) — not a mode-specific guard.

None of the three are implemented in this task.

## 13. Security invariants (to preserve through every future implementation slice)

1. Provider identity ≠ tenant authority — a provider claim (Clerk org claim,
   AuthJS session) only ever resolves to an internal id via a verified DB
   lookup; it is never trusted as tenant/organization authority directly.
2. Active organization ≠ tenant identity — `AccessContext.activeOrganization`
   is a verified working-context selection (re-verified against real
   membership every time); it carries its parent `tenantId` for reference
   but is never read as if selecting it granted tenant authority.
3. Organization admin ≠ tenant admin — an organization owner/admin role is
   never silently promoted to tenant-wide authority; `tenant`-kind
   `DataScope` is never inferred from organization membership alone and
   requires an explicit tenant-level grant or an explicitly scoped
   platform-admin operation (§7).
4. Client resource id ≠ authorization scope — a route/body/query-supplied
   `organizationId`/`tenantId` is always a *requested* identifier, checked
   against a server-derived per-operation `DataScope`, never the source of
   that scope itself.
5. Cross-tenant access requires explicit platform/tenant authority — no
   organization-scoped or tenant-scoped actor can reach another tenant
   without an explicit, server-verified platform-admin (or future
   tenant-admin) grant.
6. Organization-owned SQL carries an organization predicate, AND-ed with the
   requested id in the same statement — never a post-fetch filter.
7. Tenant-owned SQL carries a tenant predicate, AND-ed with the requested id
   in the same statement.
8. Platform-global operations are explicitly classified (`DataScope.kind ===
   'platform-global'`) — never an implicit consequence of "no scope found";
   platform-admin capability alone never makes a repository call unbounded.
9. `tenantId` and `organizationId` are never interchangeable aliases —
   enforced by branded types at compile time, not by convention alone.
10. Tenant→organization is 1:N and an organization's owning `tenantId` is
    immutable — no code path reassigns `organizations.tenant_id`, and no
    join table makes the relationship many-to-many, absent a future,
    separately designed and authorized reparenting operation.

## 14. Open non-blocking questions (do not block starting implementation)

- Whether `feature_flags`/`audit_log_settings`/`audit_events`'s ambiguous
  `tenant_id` text columns should be renamed to a real `organization_id` FK
  (recommended, lower-risk, evidence-matching choice) or genuinely fixed to
  carry true tenant ids — a Phase 1 schema decision, not resolved here.
- Whether `waitlist_entries.tenant_id` is a dead column to drop or an
  intended feature to wire up — needs a larger-dataset check before
  deciding (OZI-75's local signal is `0` populated rows, not proof).
- Whether `policies.organizationId IS NULL` should remain a valid
  global/system-policy state or become `NOT NULL` — zero observed rows
  locally; needs an explicit product decision.
- Root cause of OZI-79's two production provider-mapping anomalies (missing
  org mapping; duplicate same-provider user mapping) — plausible
  explanations given in §8, not proven; requires investigation before any
  repair.
- Whether a genuine tenant-scoped admin role/membership concept
  (`tenant_memberships`/`tenant_roles`) is a real product requirement, or
  whether platform-admin + organization-admin remain sufficient — no
  current confirmed requirement demands it; build only on demonstrated need.
- Whether AuthJS self-service organization creation is a committed product
  requirement (vs. Clerk-only for now) — affects Slice 6/8 scope, not
  Slice 1-5.
- Production topology at scale (currently 1 tenant / 1 organization) is
  unmeasured for the multi-organization-per-tenant and multi-tenant
  deployment shapes — does not block structural/type work (Slices 1-4).

None of the above blocks starting Slice 1.

## 15. Out-of-scope items (explicitly not decided or built here)

- Implementing OZI-68, OZI-69, or OZI-70 (converted to disposition + future
  slices only).
- Building the `tenant_memberships`/`tenant_roles` table or any tenant-admin
  role.
- Writing or running any migration.
- Repairing OZI-79's production provider-mapping anomalies.
- Deciding the exact fate of `waitlist_entries.tenant_id`,
  `policies.organizationId` nullability, or the `feature_flags`/
  `audit_log_settings`/`audit_events` column rename beyond a recommendation.
- Building Clerk webhook/JIT organization provisioning.
- Building AuthJS self-service organization creation UI.
- Any Production, Preview, Neon, Clerk, or Linear operation.

## 16. Ordered Phase 1 implementation slices (not executed)

1. **Introduce branded ID types + canonical `AccessContext`/`DataScope`
   contract.**
   - Purpose: make the tenantId/organizationId collapse a compile-time
     impossibility for new code.
   - Areas: `src/core/contracts/primitives.ts`, new
     `src/core/contracts/access-context.ts`.
   - Prerequisites: none.
   - Migration/data impact: none.
   - Backward compatibility: fully additive; `TenantContext` untouched.
   - Security invariant protected: #9 (no interchangeable aliases).
   - Tests: type-level tests (branding rejects a swapped id) + construction
     unit tests.
   - Rollback: delete the new file; no runtime consumer yet.
   - Production data mutation: none. Separate authorization gate: no (pure
     additive types).

2. **Wire `AccessContext` construction + per-operation `DataScope`
   derivation in parallel with `TenantContext`.**
   - Purpose: prove the new actor-context construction and the separate
     per-operation scope-derivation path are equivalent to today's behavior
     before any consumer switches.
   - Areas: a new `AccessContext` construction function and a `DataScope`
     derivation helper alongside existing resolvers; no resolver behavior
     changes.
   - Prerequisites: Slice 1.
   - Migration/data impact: none (read-only, in-memory).
   - Backward compatibility: `TenantContext` remains authoritative for every
     existing consumer.
   - Security invariant protected: #1, #2, #3, #4 (assert equivalence
     against current behavior, and that `tenant`-kind scope is never derived
     from organization membership alone).
   - Tests: differential tests — every existing resolver test case also
     asserts the derived `organization`-kind `DataScope` agrees with
     `TenantContext`; explicit negative test that organization membership
     alone never yields a `tenant`-kind scope.
   - Rollback: remove the parallel construction/derivation calls; no
     consumer depends on them yet.
   - Production data mutation: none. Separate authorization gate: no.

3. **Migrate the organizations admin surface onto canonical `DataScope`.**
   - Purpose: first real consumer cutover — smallest blast radius, already
     isolated and DB-tested (OZI-77).
   - Areas: `src/modules/authorization/domain/AdminOrganizationsScope.ts`
     (retired in favor of `DataScope`), `DrizzleAdminOrganizations{Read,Mutation}Service`,
     `src/app/api/admin/organizations/**`, `src/app/admin/organizations/**`.
   - Prerequisites: Slices 1-2.
   - Migration/data impact: none (same underlying `organizations`/`tenants`
     tables).
   - Backward compatibility: external route/response contracts unchanged.
   - Security invariant protected: #4, #6, #7, #8 (re-verify OZI-77's proven
     sibling/cross-tenant denial still holds under the new scope shape).
   - Tests: reuse and extend OZI-77's existing real-Postgres negative tests
     (sibling denial, cross-tenant denial, platform active-tenant) against
     the new scope construction.
   - Rollback: revert to `AdminOrganizationsScope`; both shapes can coexist
     during the PR review window.
   - Production data mutation: none. Separate authorization gate: no (same
     risk class already accepted for OZI-77).

4. **Migrate remaining OZI-76-audited admin surfaces
   (`users`, `feature-flags`, `invitations`, `audit-logs`,
   `audit-log-settings`) onto `AccessContext` + per-operation `DataScope`,
   one PR per surface family.**
   - Purpose: complete the admin-surface cutover in the order of ownership
     clarity — membership-based surfaces first, ambiguous-column surfaces
     (`feature-flags`, `audit-log-settings`) last, immediately before Slice 7
     resolves their column semantics.
   - Areas: per-surface route/service files named in OZI-76 `matrix.md`.
   - Prerequisites: Slice 3.
   - Migration/data impact: none yet (schema semantics unchanged until
     Slice 7).
   - Backward compatibility: unchanged external contracts.
   - Security invariant protected: #4, #6, #7.
   - Tests: reuse each surface's existing route/DB tests; add scope-shape
     assertions.
   - Rollback: per-surface revert; independent PRs.
   - Production data mutation: none. Separate authorization gate: no.

5. **Retire the three-resolver split; ship the one canonical
   membership/active-organization resolver.**
   - Purpose: land §10's decision — `single`/`personal` become bootstrap
     policy, not resolver classes; `TENANCY_MODE` becomes a deprecated
     compatibility shim read only by a bootstrap-policy adapter.
   - Areas: `src/modules/provisioning/infrastructure/{SingleTenantResolver,PersonalOrganizationResolver}.ts`
     (deleted), `OrgDbOrganizationResolver` (becomes the only `db`-source
     resolver), `src/modules/auth/index.ts` (`buildTenantResolver`),
     `src/core/env.ts` (`TENANCY_MODE` marked deprecated, still parsed).
   - Prerequisites: Slices 1-4 (every consumer must already derive its
     per-operation `DataScope` from `AccessContext` before the resolver
     split is safe to remove).
   - Migration/data impact: none directly; existing `single`/`personal`
     deployments must already have real `organizations`/`memberships` rows
     (true today — those resolvers already read from the same tables).
   - Backward compatibility: `TENANCY_MODE` env var still accepted and
     mapped to the equivalent bootstrap policy; no deployment config change
     required at this slice.
   - Security invariant protected: #1, #2, #9 (this is where the collapse
     actually stops being produced, not just typed against).
   - Tests: this slice supersedes and closes OZI-68 (prove the single
     mechanism has no ordering divergence — one query, one order) and OZI-69
     (prove switcher visibility is membership-count-driven, not
     mode-driven).
   - Rollback: revert the resolver-selection commit; `TENANCY_MODE` still
     present in env schema, so a revert is a plain code rollback with no
     data implication.
   - Production data mutation: none. Separate authorization gate: yes —
     this changes runtime authorization-path behavior for every deployment;
     requires Security/Auth sign-off before merge (per repository root
     instructions) and a canary pass equivalent to OZI-78's before
     Production rollout.

6. **Organization-creation quota enforcement (subsumes OZI-70) + one
   canonical creation service.**
   - Purpose: enforce `tenant_attributes.maxOrganizations` uniformly at
     organization creation, used by every entry point (admin,
     self-service if built, JIT webhook if built) — never duplicated per
     route.
   - Areas: new `OrganizationCreationService` in `provisioning` or
     `authorization`; existing admin creation path (if any) and any future
     self-service/JIT paths route through it.
   - Prerequisites: Slice 5 (creation must attach to the caller's own
     resolved tenant, never a client-chosen one).
   - Migration/data impact: none (reads an existing column).
   - Backward compatibility: existing tenants at or under their default
     quota (`1`) are unaffected; a tenant already over quota (OZI-79 found
     none in Production) would need an explicit decision before this ships,
     not a silent retroactive rejection.
   - Security invariant protected: #4, #5, #7 — a self-service creation must
     always resolve tenant ownership from the caller's own verified
     membership chain, never a client-supplied tenant id.
   - Tests: quota-boundary DB tests (at limit, over limit, unlimited/`0` if
     that sentinel is chosen), same-tenant-only creation test.
   - Rollback: feature-flag the enforcement point; disable without schema
     change.
   - Production data mutation: none. Separate authorization gate: yes —
     Security/Auth review of the creation-time tenant-resolution guard
     (same class OZI-70's own architecture-guard note already required).

7. **Schema correction migration(s): resolve ambiguous columns.**
   - Purpose: land §14's decisions once made — rename
     `feature_flags.tenant_id`/`audit_log_settings.tenant_id`/
     `audit_events.tenant_id` to a real `organization_id` FK (if that
     decision is confirmed); resolve `waitlist_entries.tenant_id` (drop or
     wire up); resolve `policies.organizationId` nullability.
   - Areas: `src/modules/{feature-flags,audit-log,authorization}/infrastructure/drizzle/schema.ts`
     + generated migrations.
   - Prerequisites: the three open decisions in §14 must be made explicitly
     first (not guessed here); Slice 4 (consumers already derive their
     `DataScope` from `AccessContext`, so the rename doesn't also require a
     consumer rewrite).
   - Migration/data impact: additive column(s) first (new
     `organization_id` uuid FK alongside the old `tenant_id` text column),
     never an in-place rename in one step.
   - Backward compatibility: dual-read/dual-write period required (read new
     column if present, else fall back to old) — this is Slice 7's own
     compatibility layer, removed in Slice 9.
   - Security invariant protected: #6 (organization-owned SQL finally
     carries a real organization predicate instead of a text-matched one).
   - Tests: migration idempotency test, dual-read/dual-write unit tests,
     existing feature-flag/audit-log/audit-event test suites re-run
     unchanged.
   - Rollback: drop the new column; old column and old code path remain
     functional throughout this slice.
   - Production data mutation: schema DDL only in this slice (additive,
     no data mutation yet). Separate authorization gate: yes — schema
     change on Production tables, per repository root instructions.

8. **Data backfill for the columns added in Slice 7.**
   - Purpose: populate the new `organization_id` FK for every existing row
     from the corresponding legacy `tenant_id` text value (which, per §3.6,
     already holds the correct organization uuid in every observed case).
   - Areas: one-off backfill script under `scripts/` (read old column,
     validate as a real `organizations.id`, write new column), following
     this repository's existing script/env conventions.
   - Prerequisites: Slice 7 merged and deployed; Production has the new
     column.
   - Migration/data impact: **Production data mutation** — writes the new
     column for existing rows. Must be idempotent, resumable, and validated
     read-only-first (dry-run report before any write), matching this
     repository's existing migration-safety conventions.
   - Backward compatibility: old column untouched during backfill; dual-read
     continues until Slice 9.
   - Security invariant protected: #6.
   - Tests: backfill dry-run test against a seeded dataset with both
     matching and (synthetic) non-matching legacy values, proving the
     validation step rejects a value that isn't a real `organizations.id`
     rather than writing it blindly.
   - Rollback: backfill only adds a value to the new column; the old column
     remains the read source until Slice 9, so a rollback is "stop reading
     the new column," not a data un-write.
   - Production data mutation: **yes.** Separate authorization gate: **yes**
     — explicit operator go-ahead required, per repository root
     instructions on Production data operations (same class as OZI-79's
     production execution gating).

9. **Remove compatibility readers/writers.**
   - Purpose: `TenantContext.tenantId` alias, Slice 7's dual-read/dual-write
     layer, and the `TENANCY_MODE`-to-bootstrap-policy shim are removed once
     Slices 5-8 have been stable in Production for an agreed bake period.
   - Areas: `src/core/contracts/tenancy.ts` (`TenantContext` retired in
     favor of `AccessContext` + per-operation `DataScope`), Slice 7's
     dual-read code, Slice 5's `TENANCY_MODE` shim.
   - Prerequisites: Slices 5-8 stable in Production; no consumer left
     reading the old shapes (verified by a repository-wide search, not
     assumption).
   - Migration/data impact: none (old columns can be dropped in a later,
     separate DDL slice once confirmed unused — not bundled here to avoid a
     big-bang change).
   - Backward compatibility: this slice is the deliberate end of backward
     compatibility for the old shapes — must be preceded by the agreed bake
     period, not immediately after Slice 8.
   - Security invariant protected: all — this is where "old TenantContext
     aliases stop being authoritative" formally happens.
   - Tests: full regression suite; a repository-wide grep-based CI check
     that nothing still imports the removed alias.
   - Rollback: revert the removal commit; the underlying columns/tables are
     unaffected (no data was deleted).
   - Production data mutation: none (code-only removal). Separate
     authorization gate: yes — same class as Slice 5 (runtime authorization
     path change).

10. **Remove `TENANCY_MODE` from `env.ts` and documentation.**
    - Purpose: final removal, only after Slice 9's bake period, once no
      deployment still relies on the compatibility shim.
    - Areas: `src/core/env.ts`, deployment docs/templates, `.env.example`.
    - Prerequisites: Slice 9 stable; coordinated with ops for every live
      deployment's environment variables.
    - Migration/data impact: none (env var removal only).
    - Backward compatibility: this is the deliberate end-of-life; any
      deployment still setting `TENANCY_MODE` after this slice simply has
      the variable ignored (Zod schema no longer defines it) — confirm this
      is an acceptable failure mode (ignored, not rejected) before shipping.
    - Security invariant protected: none new (cleanup).
    - Tests: env-schema tests updated to confirm the var is no longer
      required/read.
    - Rollback: revert the schema change; re-add the var definition.
    - Production data mutation: none. Separate authorization gate: no
      (env/config cleanup only, coordinate with ops as an operational step,
      not a security gate).

**Boundary markers** (as required): new `AccessContext` + per-operation
`DataScope` derivation introduced at Slice 1-2; old `TenantContext` aliases
stop being authoritative at Slice 9; schema semantics are corrected at
Slice 7; data backfill happens at Slice 8; compatibility readers/writers are
removed at Slice 9; `TENANCY_MODE` is finally removed at Slice 10.

Optional, not scheduled: a genuine tenant-scoped admin role/membership
table (`tenant_memberships`/`tenant_roles`) — build only if a real product
need for an actor between organization-admin and platform-admin
materializes (§14).

## 17. Migration/backfill boundaries

- Slices 1-6: no schema change, no data mutation, no Production
  authorization gate required except Slices 5-6 (runtime authorization-path
  changes, requiring Security/Auth sign-off + canary, same class as OZI-77/78).
- Slice 7: additive schema DDL only (new nullable column), no data mutation
  yet — still requires a Production schema-change authorization gate.
- Slice 8: the only slice that mutates existing Production data (backfill) —
  requires its own explicit, separate operator authorization, dry-run-first,
  idempotent, resumable.
- Slice 9-10: removal-only, no data mutation, gated by an explicit bake
  period after Slice 8, not by data risk.

## 18. Rollback / compatibility strategy

- Every slice up to and including Slice 8 keeps the old shape (`TenantContext`,
  old `tenant_id` text columns, `TENANCY_MODE`) readable and authoritative in
  parallel — a revert of any single slice's commit is a plain code rollback
  with no data implication, until Slice 8 specifically (which is itself
  designed to be resumable/idempotent and additive-only against existing
  data).
- No slice reverses or deletes data; Slice 9's "removal" is code-only (the
  old columns/tables are not dropped in this plan — a future, separately
  authorized DDL cleanup can drop them once confirmed unused).
- A rollback that would reopen the Phase 0 sibling-organization containment
  is never acceptable at any slice — Slice 3's cutover explicitly re-proves
  OZI-77's negative tests before and after, so a rollback of Slice 3 returns
  to the already-accepted Phase 0 baseline, never to a pre-Phase-0 state.

## 19. Current main SHA

`940a600d05faba5cfdf3d9de65126ed24303fe29` (branch
`ozi-71-tenant-organization-architecture`, verified based on this commit
before any evidence gathering began).
