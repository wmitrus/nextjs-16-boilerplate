# OZI-71 — Phase 1 Tenant/Organization Architecture Decision

Architecture only. No application code, schema, migration, remote operation,
Production access, or Linear mutation was performed to produce this document.

> **Amended 2026-09-02 — Program-Level Corrective Replan (approved: `GO — REPLAN
> READY FOR ADOPTION`).** Pre-flights for the three ambiguous admin surfaces
> (Audit Logs, Feature Flags, Audit Log Settings) established that their ordinary
> authority is `organization`, that their `tenant_id` columns have **no stable
> canonical provenance**, and that canonical `organization` `DataScope`
> containment cannot be made load-bearing without an additive `organization_id`
> ownership key. §14's rename question is now **resolved** (§14a). §16's slice
> sequence is superseded by the FF and AUD expand→dual-write→backfill→cutover
> packages, with resolver retirement after both cutovers and a split R4a/R4b
> cleanup. §3.6, §13, §16, §17, §18 are amended below. Slices 1, 2, 3, 4A
> (Invitations), 4B (Users) are complete and unchanged.

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
6. **Ambiguous `tenant_id` columns actually hold organization data (RE-QUALIFIED
   by the 2026-09-02 program replan)**: `feature_flags.tenant_id`,
   `audit_log_settings.tenant_id`, `audit_events.tenant_id` are all `text`, not
   FK — populated from whatever `TenantContext.tenantId` resolves to. OZI-75's
   observation that 100% of populated local `dev-db` `audit_events.tenant_id`
   values match `organizations.id` reflects **one local snapshot, not a
   provenance contract.** The 4C/4D/4E pre-flights established the possible
   stored-value set is heterogeneous: internal `organizations.id`; internal
   `tenants.id` (`SingleTenantResolver` `DEFAULT_TENANT_ID` fallback when its org
   lookup returns null); raw provider org id (`org_…`, provider-source, not
   UUID-shaped); **arbitrary unvalidated platform-admin string**
   (`feature_flags`/`audit_log_settings` create/upsert accept any 1–200-char
   string); `null`. **Precise statement:** these columns have **no stable
   authoritative `TenantId` or `OrganizationId` provenance** — a stored string
   may coincidentally or via a resolver fallback equal an internal tenant or
   organization UUID, but that does not make the column a canonical contract.
   Because `ownership_state` (§14a) is an independent column, an `audit_events`
   row that was organization-owned stays distinguishable from an intentional
   platform/global event even after `organization_id` is `SET NULL` on org
   deletion and after `tenant_id` is dropped. The backfill must **classify, not
   assume** (§14a, Slice AUD·C).
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
  together in the scope. **When a canonical `organization` scope carries both
  `organizationId` and `tenantId`, BOTH are load-bearing in the
  organization-owned SQL predicate** (`organization_id = scope.organizationId`
  AND an `EXISTS`/join proving `organizations.tenant_id = scope.tenantId`),
  AND-ed with the requested resource id in the same statement. This is
  mandatory, not "defense-in-depth"; an internally inconsistent tuple
  (`ORG_A + TENANT_B`) fails closed to zero rows with no global fallback
  (invariant #13, §14a.7). *(The Slice-1 `DataScope` implementation comment
  that still calls the tenant relation "optional / defense-in-depth" is
  superseded — a separate non-runtime doc-comment cleanup, per #13; the plan
  wording here is corrected now.)*
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
| Ambiguous — decision status | `feature_flags.tenant_id`, `audit_log_settings.tenant_id`, `audit_events.tenant_id` — **RESOLVED 2026-09-02 (§14a)**: additive `organization_id` FK + `ownership_state` discriminator; legacy columns never reinterpreted as canonical `TenantId`; cutover via the FF / AUD packages (§16). `policies.organizationId` (nullable — global/system policy semantics undecided) and `waitlist_entries.tenant_id` (nullable, never read/written by code) — still open, handled by `S7·resid` (§16). | see §14a / §16 |

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
  implementation Slice 4 / R2 below, not the originally scoped mode-gate fix.
- **OZI-70** (no one-org-per-tenant enforcement): **convert into a Phase 1
  implementation slice** (Slice R3, "organization-creation quota
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
11. **(added 2026-09-02; amended by independent review)** **EVERY**
    organization-owned `INSERT`/`UPSERT` — including the append-only
    `audit_events` writer — proves the full `(organizationId, tenantId)` tuple
    in the **same database statement**. A server-derived / brand-checked
    `organizationId` alone is insufficient. The write is permitted only where
    `organizations.id = scope.organizationId AND organizations.tenant_id =
    scope.tenantId` (e.g. `INSERT … SELECT … FROM organizations WHERE …`). A
    pre-check followed by an unconditional `INSERT`/`ON CONFLICT` does **not**
    satisfy #11. Zero inserted rows from the tuple proof = a write failure that
    **fails closed** (for `audit_events`: an audit DB-write failure logged/
    dropped at the `ResilientAuditLogService` boundary, **never** re-attributed
    as `intentional_global`); a platform-global write inserts `organization_id =
    NULL` directly (no tuple to prove). **The
    `ON CONFLICT` target is scope-specific** (there is no universal
    unconditional `UNIQUE(natural_key, organization_id)` during the
    compatibility period — see #12, §14a.8): an organization-scoped
    `audit_log_settings`/`feature_flags` UPSERT conflicts on the **organization
    semantic partial unique** (`WHERE organization_id IS NOT NULL AND
    ownership_state = 'canonical_organization'`) and keeps the same-statement
    tuple proof; a platform-global UPSERT conflicts on the **global semantic
    partial unique** (`WHERE ownership_state = 'intentional_global'`); an
    ordinary organization caller can never enter the global branch. The
    compact `NULLS NOT DISTINCT` conflict target is used only after R4a-1
    installs that constraint. For `feature_flags` a platform-admin
    organization-targeted create resolves a real internal organization before
    insert.
12. **(added 2026-09-02; amended by independent review)** Separate
    **OWNERSHIP/VISIBILITY** from **RETENTION**.
    - **Ownership/visibility.** `organization_id IS NULL` means platform-global
      *ownership* **only** when `ownership_state = 'intentional_global'`. Any
      other `ownership_state` with `organization_id IS NULL`
      (`canonical_organization` transiently after FK `SET NULL`,
      `organization_owned_orphaned`, `unresolved_legacy`, `quarantined`) is
      **never an ordinary organization match** and is **platform-only-visible**
      (reachable solely through an explicitly classified `platform-global`
      operation). This holds directly from the query rules —
      `organization_id IS NULL` is never an org match regardless of
      `ownership_state`, and only `intentional_global` is global-eligible for
      ownership — so **correctness does not depend on lazy reconciliation**
      flipping `canonical_organization` to `organization_owned_orphaned`.
    - **Retention (purge job only).** The purge groups `audit_events` by the
      **discriminated retention key of §14a.12**, and each group's `DELETE` /
      dry-run `COUNT` re-binds the exact key members used for its cutoff.
      `canonical_organization` (live `organization_id`) → key `(category,
      organization_id, ownership_state)` → `resolveEffectiveAuditSetting(
      category, organization_id)`. `canonical_organization` transiently
      NULL-owned and `organization_owned_orphaned` → key `(category,
      ownership_state)` → **category global DB default, else taxonomy default**
      (deterministic during/after reconciliation; the org override was
      `CASCADE`-deleted with the org). `intentional_global` → key `(category,
      ownership_state)` → global DB default → taxonomy default.
      `unresolved_legacy` / `quarantined` → key `(category, **legacy
      `tenant_id`**, ownership_state)` — the historical legacy key is part of
      the retention identity — resolved by `resolveLegacyAuditRetentionCompat`
      (§14a.11), bounded, data-migration-only. **No group is collapsed merely
      because `organization_id IS NULL`; a cutoff for legacy key A never deletes
      rows of legacy key B.** No NULL-owned non-`intentional_global` row ever
      acquires the intentional-global retention *by being mistaken for one* — it
      acquires its retention *by rule*, per its own group.
    - **Uniqueness.** Canonical uniqueness during the compatibility period is
      enforced by semantic **partial** unique constraints (§14a.8); the compact
      `UNIQUE(natural_key, organization_id) NULLS NOT DISTINCT` constraint is
      installed only at **R4a-1**, after the Quarantine Disposition Gate (§16)
      proves zero `unresolved_legacy` and zero `quarantined` rows and every
      `organization_id IS NULL` row is `intentional_global` exclusively.
13. **(added 2026-09-02; amended by independent review)** A scope or
    evaluation-context type that carries both `organizationId` and `tenantId`
    MUST make both load-bearing in the SQL that selects an organization-owned
    row (`organization_id = scope.organizationId` AND an `EXISTS`/join requiring
    `organizations.tenant_id = scope.tenantId`). Carrying a tuple member in the
    type and then ignoring it in the query is prohibited. **The tuple-validity
    proof dominates the whole statement: an invalid `(organizationId, tenantId)`
    tuple FAILS CLOSED — zero rows, and NO fall-through to any
    `intentional_global` / global-default / taxonomy-default overlay.** Global
    inheritance is reachable only *after* the organization scope is proven
    internally consistent (§14a.7 for `feature_flags`; the same rule for
    `resolveEffectiveAuditSetting` and the audit viewer). Required negative
    invariant: `ORG_A + TENANT_B → zero organization-owned rows AND no global
    fallback`. Platform-global classification semantics are unchanged.
    *(Documentation guard — do NOT reopen completed Slice 1: the Slice-1
    `DataScope` implementation comment still describes the tenant relation as
    "optional / defense-in-depth". That comment is superseded by this invariant;
    it should be corrected at the next OZI-71 code slice that touches that file,
    or in a tiny doc-only cleanup — no runtime behavior change is implied, and
    #13 is authoritative over the stale comment.)*

## 14. Open non-blocking questions (do not block starting implementation)

- ~~Whether `feature_flags`/`audit_log_settings`/`audit_events`'s ambiguous
  `tenant_id` text columns should be renamed to a real `organization_id` FK …~~
  **RESOLVED 2026-09-02 — see §14a.** Additive `organization_id` FK on all three,
  plus an explicit `ownership_state` discriminator; the legacy `tenant_id`
  columns are never reinterpreted as canonical `TenantId`.
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
  requirement (vs. Clerk-only for now) — affects Slice R3 / backfill
  (FF·C, AUD·C) scope, not Slices 1–4.
- Production topology at scale (currently 1 tenant / 1 organization) is
  unmeasured for the multi-organization-per-tenant and multi-tenant
  deployment shapes — does not block structural/type work (Slices 1-4).

None of the remaining open questions reopens completed Slices 1–4 (branded
types, `AccessContext`/`DataScope` derivation, and the membership-based admin
surfaces `organizations`/`invitations`/`users`). `S7·resid` waits on its two
residual decisions (`waitlist_entries.tenant_id`, `policies.organizationId`
nullability). The FF and AUD packages (§16) proceed on the §14a decisions.

## 14a. Resolved corrective decisions (2026-09-02 program replan)

These decisions are settled inputs to the FF and AUD packages in §16. They are
derived from the completed 4A/4B cutovers and the 4C/4D/4E pre-flights; the
supporting analysis (RW-1…RW-10 replacement wording, GrowthBook gate, uniqueness
rollout) lives in the corrective-replan artifacts alongside this plan.

### 14a.1 Canonical ownership key

Add a nullable `organization_id UUID` column to `feature_flags`,
`audit_log_settings`, and `audit_events`, keeping the legacy `text` `tenant_id`
column intact for a dual-read/dual-write compatibility period. The legacy
`tenant_id` columns are **never** reinterpreted as canonical `TenantId`
(§3.6 re-qualified). Canonical `OrganizationId` comes only from authoritative
internal resolution (§14a.4).

### 14a.2 Ownership-state discrimination

`feature_flags` and `audit_log_settings` carry an explicit `ownership_state`
column. **`audit_events.ownership_state` is also MANDATORY — Decision D-A1 is
resolved, not deferred.** States and their runtime/purge semantics:

| State | `organization_id` | Ordinary-caller visibility | Retention at purge |
|---|---|---|---|
| `canonical_organization` | **normally NOT NULL**; may be **transiently NULL** immediately after FK `ON DELETE SET NULL` and before lazy reconciliation relabels it `organization_owned_orphaned` | with a live `organization_id`: visible iff `organization_id = scope.organizationId` AND `organizations.tenant_id = scope.tenantId`. Transiently NULL: **platform-only** (never an ordinary org match — same rule as every NULL-owned state). | with a live `organization_id`: `resolveEffectiveAuditSetting(category, organization_id)` → org override → global → taxonomy. Transiently NULL: **category global DB default, else taxonomy default** — deterministic during the interval, identical to `organization_owned_orphaned`. |
| `organization_owned_orphaned` | NULL (org was `ON DELETE SET NULL`-ed; set by lazy reconciliation) | **platform-only** — invisible to every ordinary organization caller; visible only to an explicitly classified `platform-global` operation | **category global DB default, else taxonomy default** (the org-specific `audit_log_settings` override was `CASCADE`-deleted with the org). Not `intentional_global`; not the `unresolved_legacy` compat path. |
| `intentional_global` | NULL | platform-global only | global DB default → taxonomy default |
| `unresolved_legacy` | NULL | **excluded from all canonical evaluation**; visible only to a `platform-global` classified operation | purge group key `(category, **legacy `tenant_id`**, ownership_state)` (§14a.12) → `resolveLegacyAuditRetentionCompat(category, tenant_id)` (§14a.11); data-migration compatibility only; the legacy `tenant_id` is part of the retention identity. Retired at **R4b-1**, whose hard prerequisite is **`count(*) = 0` for this state on `audit_events`** — rows are resolved/dispositioned or aged-then-**purged to completion**, with an explicit post-purge zero-count proof. "Aged past `AUDIT_RETENTION_DAYS_MAX` (730d)" only makes a row *eligible* for that final purge; it is never proof the row is gone. **`audit_events` in this state does NOT gate R4a-1.** |
| `quarantined` | NULL | same as `unresolved_legacy` | same discriminated group + `resolveLegacyAuditRetentionCompat`; terminal manual disposition; never merged with `unresolved_legacy` or any other state |

An organization-owned event must **never** become `intentional_global` merely
because its FK was `SET NULL`. **Correctness does not depend on lazy
reconciliation** running: canonical queries are defensive —
`organization_id IS NULL` is never an ordinary org match regardless of
`ownership_state`, only `ownership_state = 'intentional_global'` is
global-eligible for *ownership*, and a NULL-owned `canonical_organization` row
already resolves to the global/taxonomy *retention* by its own state rule.
Reconciliation (`canonical_organization` + `organization_id IS NULL` →
`organization_owned_orphaned`) is a precision/reporting step, not a
correctness dependency.

### 14a.3 FK deletion semantics (not identical across tables)

| Column | ON DELETE | Proof |
|---|---|---|
| `feature_flags.organization_id` | **CASCADE** | a deleted org's override is dead config; `SET NULL` would promote it to a global flag and collide with the `(key, NULL)` global row. |
| `audit_log_settings.organization_id` | **CASCADE** | `NULL` has active platform-global-default semantics; delete org → the category override row is removed → effective resolution falls back to the global DB row, else the taxonomy default. `SET NULL` would turn the override into a global setting and collide with the global row. |
| `audit_events.organization_id` | **SET NULL** | append-only historical evidence must survive organization deletion; the row becomes `organization_owned_orphaned` (§14a.2), never `intentional_global`. |

`ON UPDATE`: `NO ACTION` on all three (org ids are immutable — invariant #10).

### 14a.4 Authoritative canonical organization resolution (dual-write and cutover)

Never copy `access.tenant.organizationId` / `access.tenant.tenantId` / any legacy
`TenantContext` field into a canonical column, and never brand a value by UUID
shape. Resolution runs **through the neutral `@/core/contracts` ports** in the
direction pinned by **§14a.13** (`InternalIdentityLookup`,
`OrganizationScopeAuthority`); the FF / AUD modules never resolve provider
identities themselves. For every organization-owned write:

```
candidate (node-provisioning active-org candidate, or a target resource's stored scope)
  → authoritative internal organization resolution
      • provider external org id → InternalIdentityLookup.findInternalOrganizationId
        (auth_organization_identities)
      • claimed internal id      → verify SELECT 1 FROM organizations WHERE id = candidate
      • neither resolves          → RESOLUTION FAILURE
  → brand proven organizations.id via internalOrganizationIdFromOrgRow
  → read organizations.tenant_id for that row → parentTenantIdFromOrgRow
  → { organizationId, tenantId } canonical tuple
```

On resolution failure: a writer that genuinely has organization semantics
**fails closed** (invariant error / reject / drop the DB audit write via the
existing `ResilientAuditLogService` fail-open path) — it must never write
`organization_id = NULL`. A writer that genuinely has no organization
(unauthenticated `security_event`, system job, explicitly platform-global
operation) writes `organization_id = NULL` with `ownership_state =
'intentional_global'`, never `unresolved_legacy`.

**Existing compatibility finding CF-1 (do not reopen 4A/4B):** in
`TENANCY_MODE=single` with a mis-seeded `DEFAULT_TENANT_ID` (tenant exists, no
organization), `SingleTenantResolver` copies the `tenants.id` into both fields
and the 4A/4B canonical seams raise an invariant error → 500 (fail-closed, no
leak) rather than a clear provisioning error. Address in Slice R2 (resolver
retirement makes `single` a bootstrap policy that must guarantee an organization
exists) or a small standalone fix — not by reopening 4A/4B.

### 14a.5 Audit Logs visibility — no global overlay

Ordinary organization callers see **only** their organization's audit events:
`organization_id = scope.organizationId` AND `organizations.tenant_id =
scope.tenantId` (invariant #13). **There is no `organization_id IS NULL`
overlay.** `organization_id IS NULL` events are platform-only, reachable solely
through an explicitly classified `platform-global` operation. This matches the
live `DrizzleAuditLogReadService.listForTenant` (`eq(tenant_id, callerTenantId)`,
no `isNull`). Global overlays remain valid **only** where independently proven:
Feature Flags read/evaluation (`org override > global`) and Audit Log Settings
effective-value inheritance (`org override > global DB default > taxonomy
default`).

### 14a.6 Feature Flag runtime contract (FF·D deliverable)

FF·D includes migrating the neutral core `FeatureFlagService` to a
`FeatureFlagEvaluationContext` that separates canonical **scope** from
provider-neutral evaluation facts:

- `scope: { kind: 'organization'; organizationId; tenantId } | { kind: 'platform-global' }` — the DB provider's containment key; both tuple members load-bearing (§14a.7).
- `subject: { kind: 'user'; userId } | { kind: 'system'; systemSubjectId }` — what a rollout/targeting provider hashes on; preserves today's `context.subject.id`.
- `attributes?` — optional provider-neutral facts; not authority; typed extension point, empty today.

Provider obligations: the **DB provider** uses `scope` only. **GrowthBook** keeps
`attributes.id` from `subject`, and its `company` targeting attribute is settled
through the explicit compatibility gate below — no "signature-only, behavior
unchanged" claim. `Static`/`InMemory` ignore context (already do; signature-only,
provably behavior-preserving). `Resilient` passes through; fail-safe unchanged.
The **operational switch** requests `{ kind: 'platform-global' }` explicitly with
a stable `systemSubjectId`; the synthetic `'__platform__'` tenant is **retired**
as an authority mechanism.

**GrowthBook targeting compatibility gate — blocks FF·D (not FF·A/FF·B/FF·C):**
1. Inventory every GrowthBook flag/experiment/segment/namespace/rule targeting
   `attributes.company` or `attributes.id`.
2. Architecture preference: `company` should ultimately mean canonical internal
   `OrganizationId`. **Do not introduce a `companyLegacy` bounded mapping unless
   the inventory proves a bounded compatibility window is actually required.**
3. Identify any external GrowthBook rule/config migration required.
4. Per-targeted-flag sign-off (Security/Auth + product) that targeting is
   preserved or deliberately migrated.

### 14a.7 Canonical DB feature-flag evaluation predicate (`scope.kind === 'organization'`)

**The canonical `(organizationId, tenantId)` tuple is proven valid FIRST.** An
invalid tuple (`ORG_A + TENANT_B`) **fails closed** — it returns **no row at all**
and never falls through to `intentional_global`. Global overlay/fallback is
reachable **only after** the organization scope is proven internally consistent.

```sql
WITH valid_scope AS (
  SELECT 1 FROM organizations
  WHERE id = $scopeOrganizationId
    AND tenant_id = $scopeTenantId
)
SELECT ff.enabled
FROM feature_flags ff
WHERE EXISTS (SELECT 1 FROM valid_scope)          -- invalid tuple ⇒ zero rows, no global fallback
  AND ff.key = $flag
  AND (
       ( ff.ownership_state = 'canonical_organization'
         AND ff.organization_id = $scopeOrganizationId )
       OR ff.ownership_state = 'intentional_global' -- participates ONLY when the tuple is valid
      )
ORDER BY (ff.organization_id IS NULL) ASC          -- override before global
LIMIT 1;
```

Equivalent SQL is acceptable provided the tuple-validity gate dominates the whole
statement. `scope.kind === 'platform-global'` → `WHERE ff.key = $flag AND
ff.ownership_state = 'intentional_global' LIMIT 1` (unchanged — platform-global
semantics are **not** altered). `unresolved_legacy` / `quarantined` rows never
participate. No row → `false` (fail-safe unchanged). A narrower
`OrganizationId`-only runtime contract is rejected — the admin surface needs the
full tuple and a divergent runtime shape would be a second scope model over one
table.

**Required negative test — `ORG_A + TENANT_B`:** no organization override; **no
`intentional_global` fallback**; final `isEnabled` result `false`. The same must
hold for the admin `list` (returns no scoped rows **and no global overlay**
through an invalid scope) and admin mutations (affect zero rows / fail closed).

**Same principle for ordinary organization-scoped Audit Log Settings effective
resolution** (`resolveEffectiveAuditSetting` and both admin readers): a canonical
`organization` `DataScope` MUST be proven valid (`organizations.id =
scope.organizationId AND organizations.tenant_id = scope.tenantId`) **before** the
caller may inherit `org override → global DB default → taxonomy default`. An
invalid tuple **fails closed** — it must not silently resolve as "a valid
organization with no override" (which would leak the global default to a caller
whose scope is internally inconsistent). Platform-global settings semantics are
unchanged.

### 14a.8 Uniqueness rollout (semantic partial uniques during migration)

Applies to `feature_flags` (`natural_key = key`) and `audit_log_settings`
(`natural_key = category`). `audit_events` has no scope uniqueness, ever.

| Phase | Constraints |
|---|---|
| **·A** | non-unique index `(natural_key, organization_id)`; **scoped** partial unique `UNIQUE(natural_key, organization_id) WHERE organization_id IS NOT NULL AND ownership_state = 'canonical_organization'`; legacy `UNIQUE(natural_key, tenant_id) NULLS NOT DISTINCT` stays authoritative. |
| **·B / ·C** | no constraint change. |
| **·D** | add **global** partial unique `UNIQUE(natural_key) WHERE ownership_state = 'intentional_global'` — installs without violation (the legacy `UNIQUE(natural_key, tenant_id) NULLS NOT DISTINCT` already guarantees ≤1 `tenant_id IS NULL` row per natural_key, and `intentional_global` rows are exactly those; this does **not** require zero `quarantined`). Keep the scoped partial unique + legacy unique. **Do NOT install `UNIQUE(natural_key, organization_id) NULLS NOT DISTINCT`** while `unresolved_legacy`/`quarantined` rows with `organization_id IS NULL` may still exist — they would collide with the intentional-global row. |
| **R4a-1 cleanup step (per table)** | install compact `UNIQUE(natural_key, organization_id) NULLS NOT DISTINCT`; drop the two partial uniques — only after proving, **on THAT table** (`feature_flags` or `audit_log_settings` — never a combined all-three-table gate), zero `unresolved_legacy`, zero `quarantined`, and every `organization_id IS NULL` row is `intentional_global` exclusively. `audit_events` has no such constraint and its `unresolved_legacy` / `quarantined` rows do not participate in this gate. |

Rollback: an `·D` slice reverts by dropping the global partial unique added in
that phase (scoped partial unique + legacy unique remain). The R4a
compact-constraint step reverts by dropping the compact unique and re-adding the
two partial uniques (safe — it ran only after the zero-unresolved / zero-
quarantined proof). `unresolved_legacy` / `quarantined` rows participate in no
canonical uniqueness constraint and no canonical runtime query.

### 14a.9 Migration-safe initialization of `ownership_state` (all three tables)

`ownership_state` is added to **existing, populated** tables. Every pre-existing
row must land in `unresolved_legacy` — **never `intentional_global` by
default** (a wrong default would silently grant global ownership/retention to
historical rows, violating #12). The `·A` slice for each table uses whichever of
the two strategies the actual PostgreSQL / PGlite versions in use support
cleanly:

- **Strategy 1 — additive `NOT NULL DEFAULT 'unresolved_legacy'` in one DDL
  statement**, *only if* the target PostgreSQL major version applies a constant
  column default as a metadata-only operation (no full-table rewrite / no long
  `ACCESS EXCLUSIVE` hold) **and** PGlite behaves equivalently for local/CI. In
  that case `·A` is genuine additive DDL, **no data mutation**.
- **Strategy 2 — three steps** when Strategy 1 is not provably safe:
  1. add `ownership_state text NULL` (additive DDL, no data mutation);
  2. **batched, resumable `UPDATE … SET ownership_state = 'unresolved_legacy'
     WHERE ownership_state IS NULL`** — this **IS a Production data mutation**
     with its own explicit operator gate, dry-run count first, idempotent,
     resumable (same class as FF·C / AUD·C, though it writes a single constant);
  3. validate zero `NULL` remain, then `ALTER COLUMN … SET NOT NULL`
     (+ the enum `CHECK` constraint) as a final DDL step.

The `·A` slice states which strategy it uses and, if Strategy 2, carries the
data-mutation operator gate on step 2. The same choice applies independently to
`feature_flags`, `audit_log_settings`, and `audit_events`; `audit_events` (the
highest-volume table) is the most likely to need Strategy 2. The `organization_id`
column is always added nullable with no default (no initialization needed — its
value is populated by dual-write for new rows and by the `·C` backfill for
historical rows).

**DB-enforced `ownership_state` ↔ `organization_id` consistency (defense in
depth — do not rely on writer convention alone; `ownership_state` is
security-relevant).** Each `·A` slice adds a cross-column `CHECK`, installed
Production-safely (`ADD CONSTRAINT … NOT VALID` → after the `·C` backfill /
Quarantine Disposition Gate settle every row, `VALIDATE CONSTRAINT`):

- **`feature_flags`, `audit_log_settings`:**
  ```sql
  CHECK (
    (ownership_state = 'canonical_organization' AND organization_id IS NOT NULL)
    OR
    (ownership_state IN ('intentional_global','unresolved_legacy','quarantined')
       AND organization_id IS NULL)
  )
  ```
- **`audit_events`:** the same, except `canonical_organization` MAY have
  `organization_id` non-NULL **or transiently NULL** (`ON DELETE SET NULL` must
  stay legal until lazy reconciliation), while
  `organization_owned_orphaned` / `intentional_global` / `unresolved_legacy` /
  `quarantined` **REQUIRE `organization_id IS NULL`**:
  ```sql
  CHECK (
    (ownership_state = 'canonical_organization')            -- org_id NULL or NOT NULL
    OR
    (ownership_state IN ('organization_owned_orphaned','intentional_global',
                         'unresolved_legacy','quarantined')
       AND organization_id IS NULL)
  )
  ```

Canonical queries still express their semantic predicates explicitly — the
`CHECK` is defense-in-depth, **not** licence to weaken SQL containment. Each `·A`
slice adds migration/DB tests proving every invalid `(ownership_state,
organization_id)` combination is rejected.

### 14a.10 Evidence-based legacy ownership classifier

The single authoritative classifier used by **FF·C** and **AUD·C** to map a
legacy `tenant_id` value to `(organization_id, ownership_state)`. It replaces
every earlier "class 1–6" shorthand. Classification is **evidence-driven only** —
UUID syntax alone never classifies anything, and no client-supplied value ever
becomes authority.

| Case | Legacy value | Evidence | Classification |
|---|---|---|---|
| **A** | `tenant_id IS NULL` | confirm the table's historical runtime treated `NULL` as the explicit global/unowned value (it does — §14a.2, live resolvers) | `organization_id = NULL`, `ownership_state = 'intentional_global'` |
| **B** | exact `organizations.id` match | the string is exactly a real `organizations.id` row | `organization_id = <that id>`, `ownership_state = 'canonical_organization'`; load its authoritative parent `organizations.tenant_id` |
| **C** | exact provider external-org match | the string matches an external provider organization identity via `auth_organization_identities` → one internal organization | `organization_id = <mapped internal id>`, `ownership_state = 'canonical_organization'`; load its parent tenant |
| **D** | **both** B and C resolve | both a direct `organizations.id` match **and** a provider mapping exist | if they resolve to the **same** internal organization → `canonical_organization`. If **different** organizations → `unresolved_legacy` (or `quarantined`) + **collision report**. **Never** pick one by precedence without independent evidence. |
| **E** | exact `tenants.id` match **only** | the string is a real `tenants.id` and matches no `organizations.id` and no provider mapping | `organization_id = NULL`, `ownership_state = 'unresolved_legacy'`. **Do NOT infer an organization even if that tenant currently has exactly one** — current topology cardinality is not provenance. Only an independent authoritative signal naming one exact organization may upgrade this. |
| **F** | no authoritative match | not `NULL`, matches no `organizations.id` / `tenants.id` / provider mapping (e.g. an arbitrary platform-admin string, a stale provider id) | `organization_id = NULL`, `ownership_state = 'unresolved_legacy'` |
| **G** | ambiguous / conflicting | multiple provider mappings, or other conflicting authoritative evidence | `organization_id = NULL`, `ownership_state = 'unresolved_legacy'` (or `quarantined`) + **evidence/collision report** |

**Dual-write collision.** If a historical row classifies to a canonical
`(natural_key, organization)` **already represented by a newer dual-written
`canonical_organization` row** (`feature_flags` / `audit_log_settings` only —
`audit_events` is append-only, no natural key): **do not overwrite the canonical
winner.** Set the historical duplicate to `ownership_state = 'quarantined'`,
record the disposition reason, and route it through the **Quarantine Disposition
Gate** (§16) before R4a-1.

**Per-decision report row** (dry-run first, retained for audit): source table;
row id; legacy value; every evidence source consulted and its result; resolved
internal `organization_id` (if any); authoritative parent `tenant_id` (if any);
resulting `ownership_state`; collision / disposition reason.

### 14a.11 Legacy-retention compatibility resolver (bounded, until R4b-1)

A separately-named contract, conceptually:

```
resolveLegacyAuditRetentionCompat(category, legacyTenantId) -> EffectiveRetention
```

**DATA-MIGRATION COMPATIBILITY ONLY.** It is **never** used for authorization,
**never** derives `DataScope`, **never** affects ordinary audit visibility,
**never** makes any row canonical, and exists **only** for the bounded
`audit_events` retention purge of `unresolved_legacy` / `quarantined` historical
events — until **R4b-1** removes it. After R4b-1 no runtime or purge code calls
it.

It intentionally reproduces the **pre-cutover legacy retention lookup**:

1. the `audit_log_settings` row with **exact** `(category, tenant_id =
   legacyTenantId)` → its retention;
2. else the legacy **global** row `(category, tenant_id IS NULL)` → its retention;
3. else the **taxonomy default** for `category`.

**It MAY read an `audit_log_settings` row whose canonical `ownership_state` is
`unresolved_legacy` or `quarantined`** when that row is the exact historical
legacy setting an unresolved historical event needs. **That does not make the
setting canonically active.** The two contracts are separate:

- `resolveLegacyAuditRetentionCompat` — bounded, legacy-key match, may see
  `unresolved_legacy` / `quarantined` settings rows.
- `resolveEffectiveAuditSetting` (canonical) — matches on `organization_id` +
  `ownership_state`, and **continues to exclude** `unresolved_legacy` /
  `quarantined` settings rows entirely; ordinary/admin callers can never reach
  such a row through a `DataScope`.

Tests: (a) a `quarantined` / `unresolved_legacy` settings row influences **only**
`resolveLegacyAuditRetentionCompat` on the bounded purge path; (b) the same row
is excluded from `resolveEffectiveAuditSetting` for both organization and global
resolution; (c) no `DataScope`-driven caller (admin viewer, settings CRUD) can
observe it; (d) after R4b-1 a repo-wide check finds no caller of
`resolveLegacyAuditRetentionCompat`.

### 14a.12 Canonical audit-purge grouping model (discriminated retention key)

`purgeExpiredAuditEvents` MUST group `audit_events` by a **discriminated
retention key** whose members exactly determine the retention cutoff, and the
`DELETE` / dry-run `COUNT` predicate for each group MUST re-bind **the same key
members** used to compute that group's cutoff. A cutoff computed for one group
must never delete a row belonging to a different group. Rows are **not** collapsed
merely because `organization_id IS NULL`.

| `ownership_state` (+ `organization_id`) | Grouping key | Retention resolver | `DELETE` / `COUNT` predicate binds |
|---|---|---|---|
| `canonical_organization`, live `organization_id` | `(category, organization_id, ownership_state)` | `resolveEffectiveAuditSetting(category, organization_id)` | `category` = k AND `organization_id` = the group's id AND `ownership_state = 'canonical_organization'` AND `occurred_at < cutoff` |
| `canonical_organization` transiently `organization_id IS NULL` (post-`SET NULL`) **and** `organization_owned_orphaned` | `(category, ownership_state)` | category **global DB default → taxonomy default** (no org key exists) | `category` = k AND `ownership_state` = the group's exact state AND `organization_id IS NULL` AND `occurred_at < cutoff` |
| `intentional_global` | `(category, ownership_state)` | **global DB default → taxonomy default** | `category` = k AND `ownership_state = 'intentional_global'` AND `occurred_at < cutoff` |
| `unresolved_legacy` **and** `quarantined` | `(category, legacy audit_events.tenant_id, ownership_state)` — **the historical `tenant_id` is part of the retention identity** during the bounded window | `resolveLegacyAuditRetentionCompat(category, tenant_id)` (§14a.11) | `category` = k AND `tenant_id` = the group's **exact historical value** (`IS NOT DISTINCT FROM` to handle a legacy `NULL`) AND `ownership_state` = the group's exact state AND `occurred_at < cutoff` |

Rules:
- The dry-run `COUNT` uses the **identical grouping and predicate** as `DELETE`
  (only the terminal action differs).
- `unresolved_legacy` and `quarantined` are **never** merged with each other or
  with `intentional_global` / `organization_owned_orphaned` — different
  `ownership_state`, different (or absent) legacy key ⇒ different group.
- A cutoff for legacy key **A** never deletes rows of legacy key **B**.
- The last two grouping branches (and `resolveLegacyAuditRetentionCompat`) are
  removed at **R4b-1**, and **only** once `audit_events` has
  **`count(*) = 0`** for both `unresolved_legacy` and `quarantined` — proven by
  an explicit post-purge count, not by an "aged past retention max" estimate.
  This is an `audit_events`-only condition; it does **not** gate R4a-1 or the
  `feature_flags` / `audit_log_settings` cleanup.

### 14a.13 Modular-monolith placement of canonical organization resolution

Canonical organization resolution (§14a.4) MUST NOT introduce forbidden concrete
cross-module dependencies. It uses the repository's existing **ports/adapters**
pattern.

**Prohibited (must fail `pnpm arch:lint` / the dependency-graph checks):**
- `feature-flags` or `audit-log` module importing `DrizzleInternalIdentityLookup`
  (or any `@/modules/auth` / provisioning infrastructure);
- `security` importing the concrete `DrizzleOrganizationScopeAuthority` (or any
  concrete Drizzle adapter);
- `core` importing feature-flags / audit-log / auth / security **implementation**
  code;
- provider SDK types (Clerk, etc.) leaking into `@/core/contracts`.

**Required direction:**

```text
provider / auth adapter (owning module: auth, provisioning, authorization)
        │ implements
        ▼
core neutral ports  (src/core/contracts):
  InternalIdentityLookup, OrganizationScopeAuthority,
  (+ any new neutral port explicitly introduced here)
        ▲ consumed by
security / composition seam  (src/app composition layer or src/security)
        │ produces
        ▼
canonical { organizationId, tenantId }   (branded, via provenance constructors)
        │ passed as a fact
        ▼
feature-flags / audit-log application/service contracts
  (FeatureFlagEvaluationContext; AuditLogService + the audit-write input
   carrying an AuditWriteScope = { kind:'organization'; organizationId;
   tenantId } | { kind:'platform-global' } — neutral core contracts; they
   RECEIVE the canonical tuple, they do NOT resolve Clerk/provider identities)
```

The FF and AUD modules receive canonical scope/identity facts and never resolve
provider identities. `FeatureFlagEvaluationContext`, `AuditLogService`, and the
audit-write input (with its `AuditWriteScope`) stay neutral `@/core/contracts`
types (no provider imports). Any legacy `tenant_id` compatibility key carried on
the audit-write input during the rollback window is a **separate
non-authoritative compatibility fact**, never authority or `DataScope`.

**Implementation gate:** every architecture-sensitive OZI-71 slice must pass
`pnpm arch:lint` **plus** the repository dependency-graph checks
(`pnpm skott:check:only`, `pnpm madge`). **No suppression, ignore entry, or
allowlist may be added to make an OZI-71 dependency violation pass** without an
explicit Architecture-Guard decision recorded here.

## 15. Out-of-scope items (explicitly not decided or built here)

- Implementing OZI-68, OZI-69, or OZI-70 (converted to disposition + future
  slices only).
- Building the `tenant_memberships`/`tenant_roles` table or any tenant-admin
  role.
- Writing or running any migration.
- Repairing OZI-79's production provider-mapping anomalies.
- Deciding the exact fate of `waitlist_entries.tenant_id` and
  `policies.organizationId` nullability (still open — `S7·resid`).
- *(Corrected 2026-09-02)* The `feature_flags` / `audit_log_settings` /
  `audit_events` ownership decision is **no longer open** — it is **resolved in
  §14a** (additive `organization_id` + `ownership_state`, per-table FK deletion
  semantics, semantic-partial-unique rollout). What remains out of scope for
  *this architecture-only document* is **implementing** those already-approved
  additive migrations, dual-write, backfill, and cutovers (FF·A–D / AUD·A–D in
  §16); their semantic fate is decided, not merely recommended.
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

4. **Migrate the membership-based OZI-76-audited admin surfaces
   (`organizations` [Slice 3], `invitations`, `users`) onto `AccessContext` +
   per-operation `DataScope`.** *(SUPERSEDES the original Slice 4. `audit-logs`,
   `feature-flags`, `audit-log-settings` are removed from Slice 4 — see the FF
   and AUD packages below.)*
   - Purpose: cut over the surfaces with an unambiguous organization-ownership
     key (`memberships` / `organizations`) that carry a load-bearing
     `(organizationId, tenantId)` tuple with no schema change.
   - Status: **COMPLETE** — `invitations` = Slice 4A (merged), `users` =
     Slice 4B (merged), `organizations` = Slice 3 (merged).
   - Areas: `src/app/api/admin/{organizations,invitations,users}/**` + their
     services; the shared `*-admin-scope.ts` composition seams.
   - Prerequisites: Slice 3.
   - Migration/data impact: none (membership-based surfaces, same underlying
     tables).
   - Backward compatibility: unchanged external contracts.
   - Security invariant protected: #4, #6, #7, #13.
   - Rollback: per-surface revert; independent PRs.
   - Production data mutation: none. Separate authorization gate: no.
   - **The `audit-logs`, `feature-flags`, `audit-log-settings` surfaces are NOT
     Slice-4 deliverables.** Their pre-flights (4C/4D/4E) proved the ordinary
     `organization` path cannot be canonical (both tuple members load-bearing;
     `INSERT`/`UPSERT` proven in one statement) until an additive
     `organization_id` ownership key exists and is populated, and require a
     `NULL`-overloading-safe migration-state discriminator (§14a.2). They ship
     through the two packages below. A surface is declared migrated only when
     its ordinary organization authority is canonical **end-to-end** (admin CRUD
     **and** any runtime evaluation / resolution / purge). Partial
     "platform-admin canonical / ordinary-actor legacy" delivery is **not**
     permitted.

**R1 — Adopt §14a resolved corrective decisions.** *(Governance only.)*
   - Purpose: record the settled ownership / ownership-state / FK / uniqueness /
     runtime-contract decisions (§14a) as the input to the FF and AUD packages;
     create the corresponding Linear issues/dependencies.
   - Areas: this plan (§14a, done) + Linear.
   - Prerequisites: Slice 4 (membership-based) complete.
   - Migration/data impact: none. Production gate: no.

---

### Feature Flags package (FF) — independent expand → dual-write → backfill → cutover

**FF·A — additive canonical ownership schema.**
   - Purpose: create the column + discriminator; no behavior change; migration
     cannot fail on all-NULL history.
   - Scope: `feature_flags.organization_id uuid NULL` FK →
     `organizationsReferenceTable.id` **ON DELETE CASCADE** (§14a.3);
     `feature_flags.ownership_state` — enum `canonical_organization` |
     `intentional_global` | `unresolved_legacy` | `quarantined`; **every
     pre-existing row initialized to `unresolved_legacy`, never
     `intentional_global`**, via the §14a.9 migration-safe expand strategy (the
     slice states which strategy and, if Strategy 2, carries the step-2
     data-mutation operator gate). Non-unique `index(key, organization_id)`;
     **scoped partial unique** `UNIQUE(key, organization_id) WHERE
     organization_id IS NOT NULL AND ownership_state = 'canonical_organization'`;
     the **`ownership_state ↔ organization_id` cross-column `CHECK`** of §14a.9
     (`ADD CONSTRAINT … NOT VALID` now → `VALIDATE CONSTRAINT` after FF·C /
     Quarantine Disposition Gate settle every row). Legacy `UNIQUE(key,
     tenant_id) NULLS NOT DISTINCT` stays authoritative (§14a.8).
   - Areas: `src/modules/feature-flags/infrastructure/drizzle/schema.ts` +
     one (Strategy 1) or a short sequence of (Strategy 2) generated migrations,
     plus a batched initialization script if Strategy 2.
   - Migration/data impact: **Strategy 1** — additive DDL only, no data
     mutation. **Strategy 2** — additive DDL + a batched, resumable, dry-run-
     first `UPDATE … SET ownership_state = 'unresolved_legacy' WHERE
     ownership_state IS NULL` (**a Production data mutation**) + a final `SET NOT
     NULL`. `organization_id` is added nullable with no default (no
     initialization needed).
   - Security invariant: #6 target exists; #12 (no historical row defaults to a
     global-eligible state).
   - Tests: migration idempotency; two legacy-shaped rows (`organization_id
     NULL`, same `key`, different `tenant_id`) still insert (no false collision);
     if Strategy 2, initialization dry-run count + resumability + zero-`NULL`
     validation before `SET NOT NULL`; **the §14a.9 `CHECK` rejects every
     invalid `(ownership_state, organization_id)` combination** (e.g.
     `canonical_organization` + NULL; `intentional_global` + non-NULL);
     existing `feature_flags` suites green.
   - Rollback: drop column + discriminator + partial unique + index (no rows
     removed; the `unresolved_legacy` initialization values are discarded with
     the column).
   - Production data mutation: **Strategy 1 — no; Strategy 2 — yes (step 2)**.
     Separate authorization gate: **yes** — Production schema DDL (and the
     Strategy-2 initialization is its own operator gate).

**FF·B — canonical dual-write (authoritative internal-org resolution).**
   - Purpose: every new row carries an authoritatively-resolved `organization_id`
     (or an explicit non-org classification) before anything reads it.
   - Scope: `DrizzleFeatureFlagAdminService.create` writes `organization_id` +
     `ownership_state` alongside legacy `tenant_id`, using the §14a.4 rule —
     never `access.tenant.organizationId` on faith; a platform-admin
     organization-targeted create must resolve a real `organizations.id` or be
     rejected (422); global create → `NULL` + `intentional_global`; resolution
     failure for an org-context writer → fail closed. Reads (`isEnabled`,
     `listForTenant`) stay legacy until FF·D.
   - Prerequisites: FF·A.
   - Migration/data impact: none to existing rows.
   - Security invariant: #1, #4, #8, #11.
   - Tests: ordinary create resolves + brands; platform org-targeted create with
     a non-existent org → 422; platform global → `intentional_global`;
     provider-id candidate resolves via `auth_organization_identities`; a bare
     `tenants.id` candidate → fail closed; legacy column still written
     identically; step-up preserved.
   - Rollback: stop writing the two new fields.
   - Production data mutation: no. Separate authorization gate: no.

**FF·C — evidence-based historical backfill.**
   - Purpose: populate `organization_id` / `ownership_state` for pre-FF·B rows.
   - Scope: idempotent, resumable, dry-run-first script applying the
     **§14a.10 evidence-based legacy ownership classifier** to
     `feature_flags.tenant_id` (Cases A–G + dual-write collision). Only Cases B
     and C (and D-same-org) write an `organization_id`; Case A writes
     `intentional_global`; Cases D-different / E / F / G write `NULL` +
     `unresolved_legacy` + a report row; a `(key, org)` collision with a
     dual-written canonical winner sets the historical row `quarantined` + report.
   - Prerequisites: FF·B.
   - Migration/data impact: **Production data mutation** (new column +
     discriminator only).
   - Security invariant: #6, #12; §14a.10 (evidence only, no UUID-syntax
     classification, no client value as authority).
   - Tests: dry-run over a fixture exercising every §14a.10 Case (A–G) plus a
     dual-write collision; assert Cases D-different / E / F / G never receive an
     `organization_id`; assert Case E is `unresolved_legacy` even when the
     matched tenant has exactly one organization; per-Case row counts; the
     per-decision report row shape; idempotent re-run.
   - Rollback: discriminator/column only; legacy read path still live.
   - Production data mutation: yes. Separate authorization gate: **yes**
     (dry-run artifact reviewed first).

**FF·D — atomic runtime + admin canonical cutover (closes "Slice 4D").**
   - Gate (must pass before FF·D) — *compatibility-period gate, weaker than R4a*:
     (1) **zero `active` `feature_flags` rows in `ownership_state =
     'unresolved_legacy'`** (each historical scoped row is resolved to
     `canonical_organization`, or set `quarantined`);
     (2) **`quarantined` rows MAY remain**, but only when every canonical query
     (`isEnabled`, admin `list`, admin mutations) provably excludes them (they
     match no `ownership_state` branch in §14a.7 / the admin predicates);
     (3) **every row eligible for global semantics has `ownership_state =
     'intentional_global'`** (i.e. no `unresolved_legacy`/`quarantined` row is
     ever read as global — see (2));
     (4) **no `canonical_organization` row has `organization_id IS NULL`** on
     `feature_flags` (this table's FK is `ON DELETE CASCADE`, so a canonical row
     never orphans — a NULL-owned `canonical_organization` row here is a data
     defect to fix before cutover, not a state to tolerate);
     (5) the **global semantic partial unique installs without violation**;
     (6) the **GrowthBook targeting compatibility gate** (§14a.6) has sign-off.
     This gate does **NOT** require zero `quarantined` or "every
     `organization_id IS NULL` row is `intentional_global`" — those are the
     stronger R4a-1 preconditions, closed by the **Quarantine Disposition Gate**
     (§16) between this cutover's bake and R4a-1.
   - Scope — shipped atomically (one release + canary):
     - **(i) runtime contract migration** — new neutral core
       `FeatureFlagEvaluationContext` (§14a.6); `DrizzleFeatureFlagService`
       resolves on the §14a.7 predicate; `FeatureFlagOperationalSwitch` requests
       `{ kind: 'platform-global' }` with a stable `systemSubjectId` (synthetic
       `'__platform__'` `AuthorizationContext` deleted); `Static`/`InMemory`
       signature-only; `Resilient` pass-through, fail-safe unchanged; GrowthBook
       maps `subject` → `attributes.id` and `company` per the gate's decision;
       all `isEnabled` / `isFeatureEnabled` call sites migrated; no
       `security → modules` edge.
     - **(ii) admin canonical `DataScope` cutover** — new
       `feature-flags-admin-scope.ts` seam; service accepts `Extract<DataScope,
       {kind:'organization'|'platform-global'}>`; reads/mutations bind the
       load-bearing tuple; `list` overlays global **read-only** (`OR
       ownership_state = 'intentional_global'`, never `unresolved_legacy`);
       create uses the same-statement `INSERT … SELECT FROM organizations WHERE
       id = $orgId AND tenant_id = $tenantId` proof (#11); client/API `tenantId`
       field → `organizationId`; compile-time type-test rejects `tenant`, full
       `DataScope`, `null` on mutations.
     - **(iii) constraint step** — add the **global** partial unique
       `UNIQUE(key) WHERE ownership_state = 'intentional_global'`; keep the
       scoped partial unique + legacy `UNIQUE(key, tenant_id)`. **Do NOT**
       install the compact `NULLS NOT DISTINCT` unique here (§14a.8).
     - The FF·B legacy `feature_flags.tenant_id` dual-write **continues
       unchanged** through FF·D (authoritative-for-rollback). It is demoted to a
       **non-authoritative shadow-write** at R4a-1 (reads stop; `UNIQUE(key,
       tenant_id)` and the column retained) and finally stopped + dropped at
       **R4a-2-FF** (independent of R4b).
   - Prerequisites: FF·C + FF·D-gate + GrowthBook gate.
   - Migration/data impact: none (relies on FF·C + gate).
   - Security invariant: #4, #5, #6, #8, #11, #12, #13.
   - Tests: real-PG `TENANT_A{ORG_A1,ORG_A2}` / `TENANT_B{ORG_B1}` — positive;
     sibling isolation; cross-tenant; inconsistent `ORG_A1 + TENANT_B` → zero;
     `isEnabled` `org override > global` precedence preserved; `unresolved_legacy`
     row never returned as override or global; operational switch resolves only
     `intentional_global`; platform-global CRUD; foreign-id mutation leaves the
     row unchanged; step-up preserved; pagination; fail-safe (`false`) unchanged.
   - Rollback: revert the release → legacy `isEnabled(AuthorizationContext)` +
     legacy admin dual-read resume together; drop the global partial unique.
   - Production data mutation: no. Separate authorization gate: **yes** —
     runtime authorization-path change; Security/Auth sign-off + canary.

---

### Audit package (AUD) — `audit_events` + `audit_log_settings`, one coordinated unit

Coordinated because `resolveEffectiveAuditSetting` string-equality-joins
`audit_log_settings.tenant_id` ↔ `audit_events.tenant_id` inside **every audit
write** and **the retention purge** — changing one table's ownership key without
the other breaks setting resolution / retention.

**AUD·A — additive canonical ownership schema (both tables).**
   - Purpose: create `organization_id` + `ownership_state` on both audit tables;
     Phase-A-safe constraints only.
   - Scope:
     - `audit_events.organization_id uuid NULL` FK →
       `organizationsReferenceTable.id` **ON DELETE SET NULL** (§14a.3);
       `audit_events.ownership_state` — enum `canonical_organization` |
       `organization_owned_orphaned` | `intentional_global` | `unresolved_legacy`
       | `quarantined`; **every pre-existing row initialized to
       `unresolved_legacy`, never `intentional_global`**, via the §14a.9
       strategy. `audit_events` is the highest-volume table and is the most
       likely to require §14a.9 Strategy 2 (nullable → batched initialization →
       `SET NOT NULL`); the slice states which strategy it uses and carries the
       step-2 data-mutation operator gate if Strategy 2. `index(organization_id,
       occurred_at)`. **No scope uniqueness, ever.** The **`audit_events`-shape
       `ownership_state ↔ organization_id` `CHECK`** of §14a.9
       (`canonical_organization` may be NULL-owned transiently; every other
       state requires `organization_id IS NULL`), added `NOT VALID` → validated
       after AUD·C.
     - `audit_log_settings.organization_id uuid NULL` FK →
       `organizationsReferenceTable.id` **ON DELETE CASCADE** (§14a.3);
       `audit_log_settings.ownership_state` — same 4-value enum as
       `feature_flags`; **every pre-existing row initialized to
       `unresolved_legacy`** via the §14a.9 strategy. Non-unique
       `index(category, organization_id)`; **scoped partial unique**
       `UNIQUE(category, organization_id) WHERE organization_id IS NOT NULL AND
       ownership_state = 'canonical_organization'`; the **`feature_flags`-shape
       `ownership_state ↔ organization_id` `CHECK`** of §14a.9 (`NOT VALID` →
       validated after AUD·C / Quarantine Disposition Gate). Legacy
       `UNIQUE(category, tenant_id) NULLS NOT DISTINCT` stays authoritative;
       upsert conflict target stays `(category, tenant_id)` until AUD·D.
   - Areas: `src/modules/audit-log/infrastructure/drizzle/schema.ts` + one
     (Strategy 1) or a short sequence of (Strategy 2) migrations per table, plus
     batched initialization scripts if Strategy 2.
   - Migration/data impact: per §14a.9, **per table**: Strategy 1 — additive DDL
     only; Strategy 2 — additive DDL + a batched, resumable, dry-run-first
     `UPDATE … SET ownership_state = 'unresolved_legacy'` (**a Production data
     mutation**) + `SET NOT NULL`. `organization_id` columns are added nullable
     with no default.
   - Security invariant: #6 targets exist; #12 (no historical row defaults to a
     global-eligible state).
   - **Production DDL safety planning (mandatory before any Production DDL —
     `audit_events` may be high-volume).** For the actual target PostgreSQL
     major version, determine and record:
     - whether §14a.9 Strategy 1's constant `DEFAULT` is truly metadata-only
       (PG 11+) or forces a table rewrite; if not metadata-only → Strategy 2;
     - expected **lock type and duration** for each `ALTER TABLE`, and a
       `lock_timeout` / `statement_timeout` policy so a blocked DDL aborts
       rather than queues behind it;
     - **`CREATE INDEX CONCURRENTLY`** for `idx_audit_events_organization_*`
       (and any trigram/GIN index) to avoid an `ACCESS EXCLUSIVE` hold on a
       large table — noting `CONCURRENTLY` cannot run inside a transaction and
       needs its own migration step + failure/retry handling;
     - **FK introduction as `ADD CONSTRAINT … NOT VALID` then a separate
       `VALIDATE CONSTRAINT`** so the initial add takes only `SHARE ROW
       EXCLUSIVE` briefly and the validating scan runs without blocking writes;
     - **`SET NOT NULL`** via a validated `CHECK (ownership_state IS NOT NULL)
       NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL` (PG 12+ skips the
       rescan), or an explicit maintenance window if that path is unavailable;
     - the Strategy-2 initialization `UPDATE` batch size, rate, and dead-tuple /
       autovacuum impact; run it off-peak.
     - PGlite equivalence for local/CI is **not** evidence of Production
       PostgreSQL safety — the safety plan is judged against the deployed
       engine.
     Every potentially long-running Production schema operation additionally
     carries: **dry-run size/cardinality evidence** (`audit_events` row count,
     index sizes), an **explicit operator gate**, **abort criteria**, and
     **rollback/recovery instructions**. A generated Drizzle migration is not
     assumed operationally safe merely because it is logically correct — it is
     reviewed against this checklist.
   - Tests: migration idempotency on both tables; two legacy-shaped settings
     rows (`organization_id NULL`, same `category`, different `tenant_id`) still
     insert; if Strategy 2, initialization dry-run count + resumability +
     zero-`NULL` validation before `SET NOT NULL`; **the §14a.9 `CHECK` rejects
     every invalid `(ownership_state, organization_id)` combination on each
     table** — incl. `audit_events` `organization_owned_orphaned` / `intentional_global`
     / `unresolved_legacy` / `quarantined` with a non-NULL `organization_id`,
     while `canonical_organization` is accepted both NULL-owned and non-NULL;
     a migration-forward + rollback validation on a seeded large-ish
     `audit_events` fixture; `audit-log` + `purge-expired` suites green.
   - Rollback: drop both columns + constraints + indexes (no rows removed);
     `NOT VALID` constraints and `CONCURRENTLY` indexes each have an explicit
     drop step.
   - Production data mutation: **Strategy 1 — no; Strategy 2 — yes (step 2, per
     table)**. Separate authorization gate: **yes** — Production schema DDL (+ a
     Strategy-2 initialization operator gate per table).

**AUD·B — coordinated canonical dual-write + writer classification.**
   - Purpose: every new audit row and every new settings row carries an
     authoritatively-resolved `organization_id` (or explicit non-org
     classification); resolver + purge stay on the legacy key so write/purge
     remain mutually consistent until AUD·D.
   - Scope: every audit writer (`action-audit.ts`, `security-logger.ts`, all
     `recordAdminAuditEvent` callers) classified per §14a.4 — organization
     context → resolved `organization_id` + `canonical_organization`;
     intentional platform/global or genuinely no-org → `NULL` +
     `intentional_global`; org-context resolution failure → fail closed (drop
     the DB audit write via `ResilientAuditLogService`, never a mis-attributed
     `NULL`).
   - **Same-statement `(organizationId, tenantId)` proof on the `audit_events`
     INSERT itself (invariant #11 — it applies to the append-only writer too).**
     For an **organization-owned** audit event, the insert MUST be equivalent to:
     ```sql
     INSERT INTO audit_events (..., organization_id, ownership_state)
     SELECT ..., $scopeOrganizationId, 'canonical_organization'
     FROM organizations
     WHERE organizations.id = $scopeOrganizationId
       AND organizations.tenant_id = $scopeTenantId;
     ```
     (equivalent atomic SQL acceptable). A pre-resolved / brand-checked
     `organizationId` followed by an unconditional INSERT is **not** sufficient.
     **Zero inserted rows ⇒ audit DB-write failure:** fail closed on
     attribution, let the existing `ResilientAuditLogService` boundary log/drop
     the DB write, **NEVER** rewrite it as `intentional_global`.
     **Platform/global** events INSERT directly with `organization_id = NULL,
     ownership_state = 'intentional_global'` (no tuple to prove).
   - **Audit write contract (neutral core).** Pin the audit-write input so the
     `audit-log` module receives the canonical facts for the proof — a
     provider-neutral scope, conceptually:
     ```ts
     type AuditWriteScope =
       | { kind: 'organization'; organizationId: OrganizationId; tenantId: TenantId }
       | { kind: 'platform-global' };
     ```
     (exact name may differ). Provider/auth identity resolution happens
     **outside** the `audit-log` module through the §14a.13 neutral ports; the
     module never resolves Clerk/provider identities. If a legacy `tenant_id`
     compatibility key is still needed during the AUD·B/AUD·D rollback window it
     is a **separate NON-AUTHORITATIVE compatibility fact** — never canonical
     authority, never `DataScope`.
   - `DrizzleAuditLogSettingsAdminService.upsert` writes `organization_id` +
     `ownership_state`; conflict target stays `(category, tenant_id)`.
     `resolveEffectiveAuditSetting` and `purgeExpiredAuditEvents` **unchanged**
     at AUD·B. Legacy `tenant_id` still dual-written on both tables.
   - Prerequisites: AUD·A.
   - Migration/data impact: none to existing rows.
   - Security invariant: #1, #4, #8, **#11 (now explicitly incl. the
     `audit_events` INSERT)**.
   - Tests — real-Postgres: table-driven test enumerating every writer × its
     classification; `record()` still resolves the same effective setting
     (legacy path untouched); settings upsert sets both new fields; **plus the
     INSERT-containment matrix — valid `ORG_A/TENANT_A` inserts one event;
     `ORG_A/TENANT_B` inserts ZERO events and creates NO global event;
     deleted/non-existent org inserts zero organization-attributed events;
     platform-global explicitly inserts `NULL` + `intentional_global`; no
     fallback to legacy `tenant_id` authority.**
   - Rollback: stop writing the new fields.
   - Production data mutation: no. Separate authorization gate: no.

**AUD·C — shared evidence-based backfill (both tables).**
   - Purpose: populate `organization_id` / `ownership_state` for pre-AUD·B rows.
   - Scope: one script applying the **§14a.10 evidence-based legacy ownership
     classifier** (Cases A–G + dual-write collision) to `audit_events.tenant_id`
     and `audit_log_settings.tenant_id`. Only Cases B/C/D-same-org write an
     `organization_id`; Case A → `intentional_global`; Cases D-different / E / F
     / G → `NULL` + `unresolved_legacy` + report; `audit_log_settings`
     `(category, org)` collision with a dual-written canonical winner →
     historical row `quarantined` + report (`audit_events` has no natural key,
     so no such collision). `organization_owned_orphaned` is **not** produced by
     the backfill — it is set by lazy reconciliation (a purge/maintenance pass
     flips `canonical_organization` `audit_events` rows found with
     `organization_id IS NULL` after their org was `SET NULL`-ed). Dry-run
     first; idempotent; resumable.
   - Prerequisites: AUD·B.
   - Migration/data impact: **Production data mutation** (new columns /
     discriminators only).
   - Security invariant: #6, #12; §14a.10.
   - Tests: dry-run over a fixture exercising every §14a.10 Case on both tables;
     **assert an `audit_events` row in Cases D-different / E / F / G is left
     `unresolved_legacy` and never gains an `organization_id`**; assert Case E is
     `unresolved_legacy` even for a single-org tenant; assert an unresolved
     `audit_log_settings` row is `unresolved_legacy`; **assert two `audit_events`
     rows with the same category, `organization_id IS NULL`, same
     `ownership_state`, but different historical `tenant_id` are backfilled as
     distinct legacy-retention groups** (feeds the Item-1 purge-grouping tests);
     per-Case counts; the per-decision report row shape; idempotency.
   - Rollback: discriminator/columns only.
   - Production data mutation: yes. Separate authorization gate: **yes**
     (dry-run reviewed).

**AUD·D — atomic subsystem canonical cutover (closes "Slice 4C" and "Slice 4E").**
   - Gate (must pass before AUD·D) — *compatibility-period gate, weaker than
     R4a*:
     (1) **zero `active` `audit_log_settings` rows in `ownership_state =
     'unresolved_legacy'`** — each historical scoped setting is resolved to
     `canonical_organization`, or set `quarantined` (stronger than FF only in
     that quarantining a live setting requires an explicit disposition, because
     it controls enablement/retention/sampling/metadata capture);
     (2) **`quarantined` settings MAY remain**, but only when
     `resolveEffectiveAuditSetting` and both admin readers provably exclude them
     (they match no `ownership_state` branch), so a quarantined setting resolves
     to the global DB default / taxonomy default like an absent row;
     (3) **every row eligible for global semantics has `ownership_state =
     'intentional_global'`** (no `unresolved_legacy`/`quarantined` setting is
     ever read as global — see (2));
     (4) **no `canonical_organization` `audit_log_settings` row has
     `organization_id IS NULL`** (this table's FK is `ON DELETE CASCADE`, so a
     canonical row never orphans — a NULL-owned `canonical_organization` here is
     a data defect to fix before cutover);
     (5) the **`audit_events` bounded legacy-retention compat path** (§14a.2) is
     implemented for `unresolved_legacy` / `quarantined` events;
     (6) the **global semantic partial unique installs without violation**.
     This gate does **NOT** require zero `quarantined` or "every
     `organization_id IS NULL` settings row is `intentional_global`" — those are
     the stronger R4a-1 preconditions, closed by the **Quarantine Disposition
     Gate** (§16) between this cutover's bake and R4a-1.
   - Scope — shipped atomically across the whole subsystem (one release + canary):
     - **4C viewer** (`DrizzleAuditLogReadService`): ordinary predicate is
       `organization_id = scope.organizationId AND EXISTS(SELECT 1 FROM
       organizations o WHERE o.id = audit_events.organization_id AND o.id =
       scope.organizationId AND o.tenant_id = scope.tenantId)` — **NO
       `organization_id IS NULL` overlay** (§14a.5, #13); `platform-global`
       classified operation → unrestricted.
     - **4E settings CRUD** (`DrizzleAuditLogSettingsAdminService`): canonical
       `DataScope`. **Scope-specific UPSERT** — there is **no** universal
       unconditional `UNIQUE(category, organization_id)` at AUD·D (§14a.8), so
       the `ON CONFLICT` target is **not** stated as a single unconditional
       `(category, organization_id)`:
       - **organization-scoped UPSERT** conflicts on the **organization semantic
         partial unique** (`WHERE organization_id IS NOT NULL AND ownership_state
         = 'canonical_organization'` — Postgres conflict inference against that
         partial index / its matching predicate) and **retains the
         same-statement `(organizationId, tenantId)` proof** (#11: `INSERT …
         SELECT FROM organizations WHERE id = $orgId AND tenant_id = $tenantId …
         ON CONFLICT …`), replacing `assertScopeAllows`;
       - **platform-global UPSERT** conflicts on the **global semantic partial
         unique** (`WHERE ownership_state = 'intentional_global'`);
       - an **ordinary organization caller can never enter the global branch**
         (its derived `DataScope` is `organization`; only an explicitly
         classified platform-global operation reaches the global UPSERT).
       `resetToDefault` predicate on `organization_id` (organization branch) or
       `ownership_state = 'intentional_global'` (global branch). Exact Drizzle
       syntax deferred to implementation; the Postgres conflict target/index
       inference **must** match the applicable semantic partial unique. After
       R4a-1 installs the compact `UNIQUE(category, organization_id) NULLS NOT
       DISTINCT`, the organization branch may move to that unconditional target.
     - **`resolveEffectiveAuditSetting(category, scope)`** — for an
       `organization` scope, **prove the `(organizationId, tenantId)` tuple
       valid first** (§14a.7: `EXISTS(SELECT 1 FROM organizations WHERE id =
       $orgId AND tenant_id = $tenantId)`). Invalid tuple → **fail closed**
       (return nothing; the caller does **not** inherit the global DB default or
       taxonomy default — it must not look like "a valid org with no override").
       When valid: `WHERE category = c AND (organization_id = $orgId OR
       ownership_state = 'intentional_global') ORDER BY organization_id NULLS
       LAST LIMIT 1`, else taxonomy default. `unresolved_legacy` / `quarantined`
       never match. Precedence `org override > global DB default > taxonomy
       default` preserved. Platform-global scope: unchanged.
     - **`DrizzleAuditLogService.record`**: receives an `AuditWriteScope` (§ AUD·B).
       For an `organization` event it (a) resolves the effective setting from the
       **FULL canonical organization scope** — `resolveEffectiveAuditSetting(
       category, { organizationId, tenantId })`, tuple-validity-proven per
       §14a.7, **not `organizationId` alone** — and (b) executes the
       **same-statement `(organizationId, tenantId)`-proven `audit_events`
       INSERT** (invariant #11 / § AUD·B): `INSERT … SELECT FROM organizations
       WHERE id = $orgId AND tenant_id = $tenantId`. Zero inserted rows ⇒
       audit DB-write failure (fail closed; `ResilientAuditLogService` boundary
       logs/drops; **never** re-attempted as `intentional_global`). A
       `platform-global` event inserts `organization_id = NULL, ownership_state =
       'intentional_global'` directly.
     - **`purgeExpiredAuditEvents`**: group by the **discriminated retention key
       of §14a.12** — NOT a single `DISTINCT (category, organization_id,
       ownership_state)`. Per group:
       - `canonical_organization` with a live `organization_id` → key `(category,
         organization_id, ownership_state)`; `resolveEffectiveAuditSetting(
         category, organization_id)`.
       - `canonical_organization` transiently `organization_id IS NULL` (post-
         `SET NULL`) and `organization_owned_orphaned` → key `(category,
         ownership_state)`; category global DB default → taxonomy default
         (deterministic without waiting on reconciliation, §14a.2).
       - `intentional_global` → key `(category, ownership_state)`; global DB
         default → taxonomy default.
       - `unresolved_legacy` **and** `quarantined` → key `(category, **legacy
         `audit_events.tenant_id`**, ownership_state)` — the historical
         `tenant_id` is part of the retention identity — resolved by
         **`resolveLegacyAuditRetentionCompat(category, tenant_id)`** (§14a.11:
         data-migration compatibility only, never authorization / `DataScope`).
       The `DELETE` and dry-run `COUNT` for each group **re-bind the exact key
       members** used to compute that group's cutoff (§14a.12); a cutoff for
       legacy key A never deletes rows of legacy key B; groups are never
       collapsed merely because `organization_id IS NULL`.
       The legacy-key branch is the one legacy read that survives R4a-1
       (explicitly exempted there) and is removed at **R4b-1**. Because it needs
       the historical event→setting legacy-key correspondence, R4a-1 **freezes**
       existing `audit_log_settings.tenant_id` values on canonical UPDATE, and
       `audit_log_settings.tenant_id` **cannot be `DROP COLUMN`-ed until R4b-1**
       (see R4a-2-AUD-settings). Write path and non-compat purge use identical
       canonical resolution.
     - **constraint step** on `audit_log_settings`: add the **global** partial
       unique `UNIQUE(category) WHERE ownership_state = 'intentional_global'`;
       keep scoped partial unique + legacy unique. **Do NOT** install the compact
       `NULLS NOT DISTINCT` unique here (§14a.8).
     - new `audit-logs-admin-scope.ts` + `audit-log-settings-admin-scope.ts`
       seams; compile-time type-tests; no legacy fallback. The
       `audit_log_settings.tenant_id` dual-write + `UNIQUE(category, tenant_id)`
       remain **authoritative-for-rollback** through AUD·D. At **R4a-1**:
       canonical/admin reads of `audit_log_settings.tenant_id` stop, the
       dual-write is demoted to a **non-authoritative shadow/compat write** that
       **freezes existing historical keys on UPDATE** (only new
       organization-scoped INSERTs get a canonical-`OrganizationId`-derived
       shadow key; `intentional_global` → `NULL`), and the `UNIQUE(category,
       tenant_id)` + column are retained. The **one bounded data-migration-only
       purge read** of `audit_log_settings.tenant_id` survives R4a-1 and is
       removed at **R4b-1**. The shadow/compat write is stopped and
       `audit_log_settings.tenant_id` is `DROP COLUMN`-ed only at
       **R4a-2-AUD-settings**, which is **additionally gated on R4b-1**. The
       `audit_events.tenant_id` dual-write (from AUD·B) is demoted to a
       shadow-write at **R4b-1** (purge compat branch removed there) and stopped
       + dropped at **R4b-2**. `feature_flags` follows its own R4a-1 →
       R4a-2-FF lifecycle, **independent of R4b**.
   - Prerequisites: AUD·C + AUD·D-gate.
   - Migration/data impact: none (relies on AUD·C + gate).
   - Security invariant: #4, #5, #6, #8, #11, #12, #13; retention-purge parity.
   - Tests: real-PG fixtures — setting `override > global > taxonomy default`;
     **event writer and purge resolve the same setting** for a `(category, org)`
     pair; an organization event never receives a sibling org's setting; a
     global / orphaned event gets only global/taxonomy retention;
     `unresolved_legacy` historical rows cannot silently gain ownership or global
     semantics; viewer: ordinary caller sees only their org's events, **no
     platform (`organization_id IS NULL`) event visible**; inconsistent `ORG_A1 +
     TENANT_B` → zero on viewer read and on settings mutate; upsert cannot reach
     another org's row; `resetToDefault` on a foreign scope → row unchanged;
     pagination/count parity; step-up preserved.
   - Tests — **mandatory real-Postgres purge-grouping regression (§14a.12)**:
     1. same `category`, both `ownership_state = 'unresolved_legacy'`,
        `organization_id IS NULL`, but legacy `tenant_id` = A vs B with
        **different** retention values ⇒ purged into **two** groups with two
        cutoffs;
     2. running the purge for legacy key A **does not delete any row of legacy
        key B** (and vice versa);
     3. the dry-run `COUNT` for every group uses the **identical grouping key +
        predicate** as the `DELETE` (assert equal counts and equal row sets);
     4. `quarantined` and `unresolved_legacy` groups (and `intentional_global` /
        `organization_owned_orphaned`) are **never collapsed** solely because
        `organization_id IS NULL` — a fixture with one row of each, same
        `category`, asserts four distinct groups;
     5. a `quarantined` / `unresolved_legacy` `audit_log_settings` row is used
        by `resolveLegacyAuditRetentionCompat` on the bounded purge path **only**
        and is excluded from `resolveEffectiveAuditSetting` (§14a.11).
   - Rollback: single revert (or one flag flip) → legacy resolution + purge +
     viewer resume together; drop the global partial unique.
   - Production data mutation: no. Separate authorization gate: **yes** — runtime
     authorization + data-retention behavior change (highest-risk cutover:
     mis-resolution drives deletion). Security/Auth sign-off + canary.

---

**R2 — Retire the three-resolver split; ship the one canonical
   membership/active-organization resolver.** *(= original Slice 5, prerequisite
   strengthened.)*
   - Purpose: land §10's decision — `single`/`personal` become bootstrap policy,
     not resolver classes; `TENANCY_MODE` becomes a deprecated compatibility
     shim read only by a bootstrap-policy adapter.
   - Areas: `src/modules/provisioning/infrastructure/{SingleTenantResolver,
     PersonalOrganizationResolver}.ts` (deleted), `OrgDbOrganizationResolver`
     (the only `db`-source resolver), `src/modules/auth/index.ts`
     (`buildTenantResolver`), `src/core/env.ts` (`TENANCY_MODE` marked
     deprecated, still parsed). Also address CF-1 (§14a.4).
   - **Prerequisites: Slices 1–3, Slice 4 (membership-based), AND FF·D AND
     AUD·D live and stable in Production.** Every consumer — including
     `audit-logs`, `feature-flags`, `audit-log-settings`, the audit write path,
     and the retention purge — must already derive its per-operation `DataScope`
     from `AccessContext` with load-bearing SQL containment and **no fail-open
     fallback to a legacy resolver scope**. This prerequisite is strengthened,
     not weakened, to preserve schedule. The `audit_events` legacy `tenant_id`
     read that persists in the bounded retention-compat path is data-migration
     compatibility only, never an authorization fallback, and does not gate this.
   - Migration/data impact: none directly.
   - Security invariant: #1, #2, #9.
   - Tests: supersedes and closes OZI-68 (one query, one order) and OZI-69
     (switcher visibility membership-count-driven).
   - Rollback: revert the resolver-selection commit; `TENANCY_MODE` still in the
     env schema, so a plain code rollback with no data implication.
   - Production data mutation: none. Separate authorization gate: **yes** —
     runtime authorization-path change for every deployment; Security/Auth
     sign-off + canary equivalent to OZI-78's before Production rollout.

**R3 — Organization-creation quota enforcement (subsumes OZI-70) + one canonical
   creation service.** *(= original Slice 6; concurrency-safety made explicit.)*
   - Purpose: enforce `tenant_attributes.maxOrganizations` uniformly at
     organization creation, used by every entry point — never duplicated per
     route.
   - Owner module: **`provisioning`** — organization creation/provisioning is
     the business operation being coordinated. `authorization` provides the
     authority evidence (may the caller create in this tenant); it does **not**
     own the provisioning workflow.
   - Areas: new `OrganizationCreationService` in `provisioning`; **every**
     creation entry point (admin, future self-service, future JIT webhook)
     routes through it.
   - **Concurrency safety (mandatory — a naive read-count-then-INSERT is
     prohibited):** the quota check **and** the organization `INSERT` must be
     **atomic / serialized at the database level** so two concurrent requests
     cannot both observe `count < maxOrganizations` and both create.
     Implementation chooses a proven mechanism and documents it, e.g.: a
     transaction that takes a **row lock on the owning `tenants` /
     `tenant_attributes` row** (`SELECT … FOR UPDATE`) before counting and
     inserting; a **`pg_advisory_xact_lock` keyed by tenant id**; or another
     documented serialization primitive. The count and the insert are in the
     **same transaction** under that lock.
   - Prerequisites: R2 (creation must attach to the caller's own resolved
     tenant, never a client-chosen one).
   - Security invariant: #4, #5, #7.
   - Tests: quota-boundary DB tests; same-tenant-only creation test; **a
     real-Postgres concurrency test — `maxOrganizations = N`, two concurrent
     requests compete for the final slot, exactly one succeeds, final row count
     never exceeds `N`** (repeat under load to catch lock-scope regressions).
   - Rollback: feature-flag the enforcement point; disable without schema change.
   - Production data mutation: none (reads an existing column; the lock/txn adds
     no schema). Separate authorization gate: **yes** — Security/Auth review of
     the creation-time tenant-resolution guard **and** the serialization
     mechanism.

**S7·resid — Residual schema hygiene.** *(residue of the original Slice 7, off
   the R2 critical path.)*
   - Purpose: resolve `waitlist_entries.tenant_id` (drop, per OZI-76
     "platform-global by design", or wire up if a real need surfaces) and
     `policies.organizationId` nullability (authorization-module global-policy
     decision).
   - Areas: `src/modules/authorization/infrastructure/drizzle/schema.ts` (+
     waitlist schema) + migration.
   - Prerequisites: the two open §14 questions answered explicitly first.
   - Migration/data impact — **classified honestly per outcome**:
     - **`waitlist_entries.tenant_id` retained/wired-up:** additive DDL only, no
       data mutation.
     - **`waitlist_entries.tenant_id` DROPPED:** a **destructive column drop** —
       requires a zero-reader **and** zero-writer proof, explicit dedicated
       destructive-DDL operator authorization, and a **backup / PITR or
       reconstruction plan** for any populated values (OZI-75's local `0`
       populated rows is a signal, not proof — confirm on real data first).
     - **`policies.organizationId` → `NOT NULL`:** a **constraint tightening** —
       requires **pre-validation that zero incompatible (`NULL`) rows exist**
       (validated `CHECK`-first / `NOT VALID` → `VALIDATE CONSTRAINT`, or a
       maintenance window), plus a decision on what to do with any global/system
       policy rows found; not a no-op.
   - Production data mutation: **none for the retain path; yes (destructive) for
     a `waitlist_entries.tenant_id` drop; constraint-tightening for the
     `policies.organizationId` path.** Separate authorization gate: **yes**
     (schema DDL, with a dedicated destructive-DDL / constraint-validation gate
     for the tightening/drop outcomes).

**Quarantine Disposition Gate — TABLE-SPECIFIC. There is NO global
   all-three-table zero gate.** *(A gate / controlled operations work item, not
   a new architecture phase. Runs after the FF·D / AUD·D bake; does not block
   R2 / R3.)*
   - Purpose: FF·C / AUD·C (§14a.10) and the FF·D / AUD·D compatibility-period
     gates deliberately allow `unresolved_legacy` / `quarantined` rows to
     survive the canonical cutover (canonical queries exclude them). Each table
     is then cleared on its **own** timeline; the audit-events history
     dependency (§14a.11/§14a.12) is NOT allowed to block the `feature_flags`
     or eligible `audit_log_settings` cleanup.

   - **`feature_flags`:** disposition of its `unresolved_legacy` / `quarantined`
     rows to zero **gates only the Feature Flags compact-unique install /
     R4a-1 for `feature_flags`** (§14a.8, R4a-1).
   - **`audit_log_settings`:** disposition of its `unresolved_legacy` /
     `quarantined` rows to zero **gates only the Audit Settings compact-unique
     install / R4a-1 for `audit_log_settings`.**
     **Legacy-retention-key dependency guard (hard rule):** before **deleting**,
     **merging away**, or **rewriting the legacy `tenant_id` key of** any
     `audit_log_settings` row, prove that **no `unresolved_legacy` /
     `quarantined` historical `audit_events` row still depends on that exact
     `(category, audit_log_settings.tenant_id)`** through
     `resolveLegacyAuditRetentionCompat` (§14a.11). If historical events still
     depend on it:
       - **reclassification is allowed only if the historical `tenant_id` value
         is preserved and the compat resolver keeps reproducing the same legacy
         setting** (i.e. an `ownership_state`-only `UPDATE` that does not touch
         `tenant_id`);
       - **deletion / legacy-key rewrite is PROHIBITED**;
       - otherwise the `audit_log_settings` cleanup **remains deliberately
         blocked** until R4b-1 removes the compat dependency.
   - **`audit_events`:** disposition of its `unresolved_legacy` / `quarantined`
     rows to zero **MUST NOT gate R4a-1**. It **gates R4b-1 only** (§ R4b-1).
     Historical audit events may remain for the bounded retention window while
     `feature_flags` and eligible `audit_log_settings` cleanup proceed.

   - Per row, drive an **evidence-based, recorded disposition** into exactly one
     outcome. **Every mutating outcome is a Production data mutation** and
     carries: dry-run; per-row evidence; **explicit operator authorization**;
     before/after counts; idempotency; audit trail.
     1. **resolve → `canonical_organization`** — when authoritative ownership
        evidence (a §14a.10 Case B/C/D-same-org signal) becomes available.
        **Production data mutation** (`ownership_state` + `organization_id`
        `UPDATE`).
     2. **resolve → `intentional_global`** — **only** when genuine global
        ownership is *proven* (never automatic — §14a.2, #12). **Production data
        mutation AND a security/semantic behavior change.** For `feature_flags`
        / `audit_log_settings` this **immediately changes runtime behavior**
        (the row leaves the excluded set and becomes a live global default);
        requires an explicit **semantic-impact review + Security/Product
        sign-off** before execution.
     3. **merge/reconcile into the existing canonical winner** — dual-write
        duplicate: the dual-written `canonical_organization` row wins. **Production
        data mutation**; if it also deletes/retires the duplicate, additionally
        apply the destructive row-disposition gate (outcome 4).
     4. **archive/export then delete** a redundant / invalid legacy row —
        **destructive Production data mutation** under a separately authorized
        destructive-row-disposition gate (dry-run, per-row reason/evidence,
        before/after counts, idempotency, auditable manual decision).
     5. **retain as `unresolved_legacy` / `quarantined`** — only while that
        table's cleanup is *intentionally* held (recorded). **No mutation.**
   - **Never** auto-promote a `quarantined` / `unresolved_legacy` row to
     `canonical_organization` **or** `intentional_global`. **Never** delete such
     a row without explicit disposition evidence.
   - **Duplicate-collision retirement** (`feature_flags` / `audit_log_settings`,
     same `(natural_key, canonical organization)`): dual-written canonical row
     wins; the quarantined legacy duplicate is archived/exported and deleted via
     outcome 4 **before** that table's compact `NULLS NOT DISTINCT` unique /
     R4a-1 (its continued existence would block the constraint). For
     `audit_log_settings`, only if the §14a.11 legacy-retention-key dependency
     guard above allows it.
   - Deliverables **per table**: a dry-run disposition report (per-row: table,
     id, legacy value, evidence consulted, chosen outcome + reason, before/after
     counts); idempotent execution; audit trail; a **per-table final zero
     `unresolved_legacy` / zero `quarantined` proof** — the entry criterion for
     that table's R4a-1 step (`feature_flags`, `audit_log_settings`) or R4b-1
     (`audit_events`).
   - Prerequisites: FF·D + AUD·D stable in Production; the FF·C / AUD·C
     classifier reports available.
   - Production data mutation: **yes** — outcomes 1–4 all mutate
     (`ownership_state` / `organization_id` `UPDATE`, or archive-then-delete);
     each under its own operator gate. Only outcome 5 (retain) is a no-op.

**R4a — Ordinary legacy-contract / FF / Audit-Settings cleanup.** *(part of the
   original Slice 9, split. R4a-1 reversible; R4a-2 destructive, itself split
   into R4a-2-FF and R4a-2-AUD-settings — the latter additionally gated on
   R4b-1, because a bounded data-migration-only purge path still reads
   `audit_log_settings.tenant_id` until then.)*
   - Purpose: strip canonical legacy `tenant_id` **authority and reads** from
     `feature_flags` / `audit_log_settings` and retire the
     `TenantContext.tenantId` alias + `TENANCY_MODE` shim (R4a-1, reversible);
     then, per table, after its own further bake + destructive-DDL
     authorization, stop the legacy shadow/compat write and drop the column
     (R4a-2-FF; R4a-2-AUD-settings, which waits for R4b-1).
   - Prerequisites: FF·D + AUD·D + R2 + R3 stable in Production for the agreed
     bake period; repo-wide search shows no **canonical** reader of the removed
     shapes; **and the Quarantine Disposition Gate has produced the per-table
     zero proof for the table this R4a-1 step touches** — namely **zero
     `unresolved_legacy` + zero `quarantined` on `feature_flags`** (for the
     `feature_flags` compact-unique / cleanup) and **zero `unresolved_legacy` +
     zero `quarantined` on `audit_log_settings`** (for the `audit_log_settings`
     compact-unique / cleanup), **with the §14a.11 legacy-retention-key
     dependency guard satisfied for `audit_log_settings`**.
   - **`audit_events` `unresolved_legacy` / `quarantined` rows do NOT gate
     R4a-1** — that is R4b-1's prerequisite only (R4a and R4b were split to keep
     the audit-events retention history off the `feature_flags` /
     `audit_log_settings` cleanup path).

   - **R4a-1 — canonical authority/read cleanup (reversible).**
     - Canonical runtime / read / mutation authority becomes `organization_id` +
       `ownership_state` **only**.
     - Scope:
       - **`feature_flags`:** remove **all legacy `tenant_id` READS**; all
         authority dependence on `TenantContext`.
       - **`audit_log_settings`:** remove all **canonical runtime / admin**
         legacy `tenant_id` reads and all `TenantContext` authority — **BUT
         explicitly EXEMPT the one bounded, data-migration-only
         `audit_events` retention-compat read** of
         `audit_log_settings.tenant_id` (introduced at AUD·D: unresolved /
         quarantined historical events resolve retention via the historical
         legacy key). This exemption is removed at **R4b-1**, is **never** an
         authorization fallback, never derives `DataScope`, and never gates
         admin access.
       - **Install the compact `UNIQUE(natural_key, organization_id) NULLS NOT
         DISTINCT`** on both (drop the two semantic partial uniques, §14a.8).
       - Remove `TenantContext.tenantId` alias (`src/core/contracts/tenancy.ts`)
         and the resolver / `TENANCY_MODE` bootstrap shim.
       - **Retain through the bake period**, as compatibility/rollback data
         only: the legacy `tenant_id` **columns**; the legacy
         `UNIQUE(key, tenant_id)` / `UNIQUE(category, tenant_id)`; and a
         **minimal NON-AUTHORITATIVE legacy `tenant_id` SHADOW/COMPAT-WRITE** on
         create/update. The shadow value is **never** read for authorization,
         **never** by canonical runtime, **never** used to derive `DataScope`,
         **never** accepted from a client. The encoder is decoupled from
         authority — **not** fed by a retained legacy authority path.
       - **`feature_flags` shadow key:** derive from the canonical
         `organization_id` (or `NULL` for global rows). `feature_flags` has no
         audit-retention dependency, so normalization is harmless.
       - **`audit_log_settings` shadow/compat key — FROZEN/PRESERVED while the
         R4b retention-compat path is live:**
         - on canonical **UPDATE** of an existing row, **do NOT overwrite its
           existing historical `tenant_id`** value — freeze it, so an
           unresolved / quarantined historical `audit_events` row can still
           string-match the same retention setting;
         - on canonical **INSERT** of a new organization-scoped setting, the row
           **may** receive a non-authoritative rollback shadow key derived from
           the canonical `OrganizationId`;
         - `intentional_global` settings use `NULL`;
         - the compat key is never accepted from a client and never used for
           authority.
     - Areas: `src/core/contracts/tenancy.ts`, the two `audit-log` /
       `feature-flags` schema + service files, R2's `TENANCY_MODE` shim,
       `scripts/audit-log/purge-expired.ts` (compat read kept, documented as
       data-migration-only).
     - Security invariant: all — canonical legacy aliases and canonical legacy
       reads formally stop being authoritative; the retained shadow/compat write
       and the exempted purge read carry no authority.
     - Tests: full regression + CI grep guard that no **canonical** path reads
       `feature_flags.tenant_id`, and that the **only** remaining
       `audit_log_settings.tenant_id` read is the labelled data-migration-only
       purge-compat branch; a test asserting the shadow/compat write populates
       new-row keys and **preserves an existing historical
       `audit_log_settings.tenant_id` on canonical update**; a test that an
       unresolved historical `audit_events` row still resolves the same
       retention setting after R4a-1; compact-unique installs without violation.
     - Rollback: revert the commit; compact unique → the two semantic partial
       uniques; the legacy columns, the legacy `UNIQUE(*, tenant_id)`, the
       exempted purge-compat read, **and the continuously-maintained shadow
       values (historical preserved + every bake-period row)** are already
       intact — so re-adding the legacy `NULLS NOT DISTINCT` unique cannot fail,
       the historical event→setting legacy-key correspondence is unbroken, and
       **no row-data reconstruction is required**. Plain code + reversible-DDL
       rollback.
     - Production data mutation: none (no row deletion; the shadow/compat write
       is a continuation of an existing per-row write, not a bulk backfill; the
       freeze rule means canonical UPDATE never rewrites a historical key).
       Separate authorization gate: **yes** — runtime authorization-path change
       + reversible schema DDL.

   - **R4a-2-FF — destructive retirement of `feature_flags.tenant_id`.**
     - `DROP COLUMN` **destroys the column data.** **Not** a simple rollback
       after execution. Independent of R4b.
     - Prerequisites, all required: R4a-1 stable in Production for a further
       bake period; **explicit dedicated destructive-DDL operator
       authorization**, separate from R4a-1's; a signed-off **backup / PITR or
       deterministic reconstruction plan with agreed RTO/RPO** (reconstruction
       from `organization_id` is lossy for historical `quarantined` /
       provider-only rows — acknowledged; those were never canonical).
     - Scope, one coordinated code + schema step:
       1. **stop the `feature_flags` legacy `tenant_id` SHADOW-WRITE**;
       2. **prove ZERO READERS AND ZERO WRITERS** of `feature_flags.tenant_id`
          (application, scripts, migrations, any BI/export);
       3. **drop the legacy `UNIQUE(key, tenant_id)`**;
       4. **`ALTER TABLE feature_flags DROP COLUMN tenant_id;`**
     - Rollback: **not a simple revert** — re-add the column via DDL **and**
       restore / reconstruct its data from backup or PITR; plan + RTO/RPO signed
       off first.
     - Production data mutation: **yes — destructive (column drop).** Separate
       authorization gate: **yes — dedicated destructive-DDL operator sign-off.**

   - **R4a-2-AUD-settings — destructive retirement of
     `audit_log_settings.tenant_id`.**
     - `DROP COLUMN` **destroys the column data.** **Not** a simple rollback.
     - **Additional hard prerequisite: R4b-1 complete** — the bounded
       `audit_events` retention-compat path and its data-migration-only read of
       `audit_log_settings.tenant_id` must already be removed. **`DROP COLUMN`
       `audit_log_settings.tenant_id` MUST NOT run while any reader of it exists,
       including the R4b retention-compat read.**
     - Other prerequisites, all required: R4a-1 stable for a further bake
       period; **explicit dedicated destructive-DDL operator authorization**; a
       signed-off **backup / PITR or reconstruction plan with agreed RTO/RPO**.
     - Scope, one coordinated code + schema step:
       1. **stop the `audit_log_settings` legacy `tenant_id` shadow/compat
          write**;
       2. **prove ZERO READERS AND ZERO WRITERS** of
          `audit_log_settings.tenant_id` — including confirmation that R4b-1
          removed the retention-compat read;
       3. **drop the legacy `UNIQUE(category, tenant_id)`**;
       4. **`ALTER TABLE audit_log_settings DROP COLUMN tenant_id;`**
     - After R4a-2-FF and R4a-2-AUD-settings, `ownership_state` is the sole
       discriminator on the two mutable tables.
     - Rollback: **not a simple revert** — re-add the column via DDL **and**
       restore / reconstruct its data from backup or PITR; plan + RTO/RPO signed
       off first.
     - Production data mutation: **yes — destructive (column drop).** Separate
       authorization gate: **yes — dedicated destructive-DDL operator sign-off.**

**R4b — `audit_events` legacy `tenant_id` retirement.** *(part of the original
   Slice 9 + the original Slice 7/9 column drop, split; **independent of R4a**.
   Two sub-steps: R4b-1 reversible; R4b-2 destructive. AUD·B introduced the
   `audit_events.tenant_id` dual-write; R4b is where its writer is retired.)*
   - Purpose: remove the bounded legacy-retention `tenant_id` **read** and move
     the purge job to canonical semantics only (R4b-1, reversible); then, in a
     coordinated step, stop the `audit_events.tenant_id` **writer** and drop the
     column (R4b-2, destructive).

   - **R4b-1 — reversible retention-compat removal (removes BOTH sides of the
     legacy retention-key read dependency).**
     - **Hard prerequisite — PHYSICALLY ZERO ROWS, not merely "aged":**
       `SELECT count(*) FROM audit_events WHERE ownership_state =
       'unresolved_legacy'` **= 0** AND `… WHERE ownership_state = 'quarantined'`
       **= 0**. "Aged past `AUDIT_RETENTION_DAYS_MAX` (730d)" only makes a row
       **eligible** for the final bounded compat purge — it is never proof the
       row is gone. The lifecycle is:
       1. every such row is resolved / dispositioned (Quarantine Disposition
          Gate) **or** aged past retention max;
       2. **run the bounded legacy-compat purge to completion** for the two
          §14a.12 legacy-key grouping branches (final dry-run/count artifact
          first, then execution for the eligible rows);
       3. **verify the two explicit post-purge zero-row counts above**;
       4. **only then** remove the two legacy grouping branches and
          `resolveLegacyAuditRetentionCompat` (§14a.11).
       If either count is non-zero, **R4b-1 aborts** — the remaining rows are
       dispositioned or purged and the counts re-verified.
     - Deliverables: final dry-run/count artifact; final compat-purge execution
       record; post-purge zero-count proof for both states.
     - Does **not** block R4a-1 or R4a-2-FF (but **does** gate
       R4a-2-AUD-settings).
     - Scope:
       - Remove the bounded legacy-retention compat branch from
         `purgeExpiredAuditEvents` — i.e. **delete the two §14a.12 legacy-key
         grouping branches (`unresolved_legacy` / `quarantined`) and the
         `resolveLegacyAuditRetentionCompat` contract (§14a.11) itself**; a
         repo-wide check confirms zero remaining callers.
       - End **all** `audit_events.tenant_id` **reads** (purge and any other
         consumer); **and remove the final data-migration-only read of
         `audit_log_settings.tenant_id`** that the compat branch performed (the
         read exempted in R4a-1). Canonical purge grouping only (§14a.12's first
         three branches).
       - **After R4b-1 there is no retention dependency on either legacy audit
         key** (`audit_events.tenant_id` or `audit_log_settings.tenant_id`), and
         no code path calls `resolveLegacyAuditRetentionCompat`.
       - **Retain**, as compatibility/rollback data only: the
         `audit_events.tenant_id` column, and a **NON-AUTHORITATIVE
         `tenant_id` SHADOW-WRITE** on the audit-write path during the R4b-1
         bake period. The shadow value is **never** used for authorization,
         **never** for canonical retention, **never** to derive `DataScope`.
         Derive it from the event's canonical `organization_id` (or `NULL` for
         non-org events), not from any legacy authority path. *(The
         `audit_log_settings` compat/shadow write from R4a-1 also stays until
         R4a-2-AUD-settings, purely as rollback data for R4b-1.)*
     - Rollback: revert the commit; the compat branch, the
       `audit_events.tenant_id` read **and** the data-migration-only
       `audit_log_settings.tenant_id` read return; **no row-data reconstruction
       required** — the frozen historical `audit_log_settings.tenant_id` values
       (R4a-1 freeze rule) and the historical + bake-period `audit_events`
       shadow values are all present, so the event→setting legacy-key
       correspondence is intact.
     - Production data mutation: none. Separate authorization gate: **yes** —
       code + purge-behavior change.

   - **R4b-2 — destructive retirement (`audit_events.tenant_id`).**
     - `DROP COLUMN` destroys the column data. Expected to be the **last** of
       the three legacy columns dropped. **No `DROP COLUMN` while any
       `audit_events.tenant_id` writer (including the shadow-write) remains.**
     - Prerequisites, all required: R4b-1 stable in Production for a bake
       period; **explicit dedicated destructive-DDL operator authorization**,
       separate from R4b-1's; a signed-off **backup / PITR or reconstruction
       plan with agreed RTO/RPO** (reconstruction from `organization_id` is
       lossy for `unresolved_legacy` / `organization_owned_orphaned` rows —
       acknowledged).
     - Scope, in one coordinated code + schema step:
       1. **stop the `audit_events.tenant_id` SHADOW-WRITE**;
       2. **prove ZERO READERS AND ZERO WRITERS** of `audit_events.tenant_id`
          anywhere;
       3. **`ALTER TABLE audit_events DROP COLUMN tenant_id;`**
     - Rollback: **not a simple revert** — re-add the column via DDL **and**
       restore / reconstruct its data from backup or PITR; the rollback plan and
       RTO/RPO signed off before R4b-2 runs.
     - Production data mutation: **yes — destructive (column drop).** Separate
       authorization gate: **yes — dedicated destructive-DDL operator sign-off.**

**R5 — Remove `TENANCY_MODE` from `env.ts` and documentation.** *(= original
   Slice 10.)*
   - Prerequisites: R4a-1 stable (needs the shim gone); coordinated with ops.
     Does not depend on R4a-2-FF / R4a-2-AUD-settings / R4b-2 (the destructive
     column drops).
   - Areas: `src/core/env.ts`, deployment docs/templates, `.env.example`.
   - Migration/data impact: none. Separate authorization gate: no (config
     cleanup; coordinate with ops).

**Boundary markers** (as required): new `AccessContext` + per-operation
`DataScope` derivation introduced at Slices 1–2; membership-based admin surfaces
cut over at Slices 3–4 (complete); the ambiguous-column surfaces
(`audit-logs`, `feature-flags`, `audit-log-settings`) get their `organization_id`
ownership key + `ownership_state` discriminator, dual-write from authoritative
internal-org resolution, evidence-based backfill, and consumer cutover per
package **before** each surface is declared migrated and **before** resolver-split
retirement (R2); **semantic partial** uniqueness constraints install at cutover,
the compact `NULLS NOT DISTINCT` constraint only at **R4a-1 per table** after a
**table-specific** zero `unresolved_legacy` / zero `quarantined` proof
(`feature_flags` on `feature_flags`; `audit_log_settings` on
`audit_log_settings` + the §14a.11 legacy-key dependency guard) — there is **no
combined all-three-table gate**, and **`audit_events` `unresolved_legacy` /
`quarantined` rows never gate R4a-1** (only R4b-1, whose hard prerequisite is
`count(*) = 0` on `audit_events` for both states, proven post-purge — "aged
past 730d" only makes a row purge-eligible); every organization-owned
`audit_events` INSERT proves the `(organizationId, tenantId)` tuple in the same
statement (invariant #11) and a zero-row result fails closed, never becoming an
`intentional_global` event; a DB `CHECK` on each `·A` table enforces the
`ownership_state ↔ organization_id` combinations (defense in depth, §14a.9); the
Feature Flags runtime migrates to `FeatureFlagEvaluationContext` (scope +
subject) inside FF·D, gated by a GrowthBook targeting-compatibility review;
**canonical** legacy `tenant_id` **reads** and `TenantContext.tenantId` /
`TENANCY_MODE` authority for `feature_flags` / `audit_log_settings` stop at
**R4a-1** (reversible), which
retains a **non-authoritative legacy `tenant_id` shadow/compat write** (decoupled
from authority) plus the legacy `UNIQUE(*, tenant_id)` and columns as a
continuously-maintained rollback safety net — **for `audit_log_settings`, R4a-1
freezes existing historical keys on canonical UPDATE and explicitly exempts the
one bounded data-migration-only `audit_events` retention-compat read**;
`feature_flags` retires under **R4a-2-FF** (stop shadow-write →
zero-readers-AND-zero-writers → drop legacy unique → `DROP COLUMN`),
**independent of R4b**; `audit_log_settings.tenant_id` retires under
**R4a-2-AUD-settings**, which is **additionally gated on R4b-1** and must not
`DROP COLUMN` while any reader (including the retention-compat read) remains; the
`audit_events` bounded retention-compat path — **both** the
`audit_events.tenant_id` read **and** the data-migration-only
`audit_log_settings.tenant_id` read — is removed at **R4b-1** (reversible, after
which no retention dependency on either legacy audit key remains), which retains
a non-authoritative `audit_events.tenant_id` shadow-write; the writer is stopped
and `audit_events.tenant_id` is `DROP COLUMN`-ed only at **R4b-2** (destructive,
one coordinated step, zero-readers-AND-zero-writers proof, separately gated),
expected last of the three; `TENANCY_MODE` is removed after R4a-1 (R5).

Optional, not scheduled: a genuine tenant-scoped admin role/membership
table (`tenant_memberships`/`tenant_roles`) — build only if a real product
need for an actor between organization-admin and platform-admin
materializes (§14).

## 17. Migration/backfill boundaries

*(Amended 2026-09-02: the single Slice 7 / Slice 8 events are replaced by the FF
and AUD package phases.)*

- Slices 1–4, R1: no schema change, no data mutation.
- **FF·A, AUD·A** — additive schema DDL, Phase-A-safe partial-unique constraints
  only. `ownership_state` initialization of existing rows follows §14a.9: under
  Strategy 1 there is **no data mutation**; under Strategy 2 the batched
  `UPDATE … SET ownership_state = 'unresolved_legacy'` **is a Production data
  mutation** with its own operator gate (dry-run-first, resumable). Each `·A`
  slice also requires a Production schema-change authorization gate.
- **FF·C, AUD·C** — the phases that mutate existing Production data (backfill of
  `organization_id` / `ownership_state` classification); each requires its own
  explicit, separate operator authorization, dry-run-first, idempotent,
  resumable.
- **FF·D, AUD·D** — runtime authorization-path changes (and, for AUD·D,
  data-retention behavior); Security/Auth sign-off + canary; no row or column
  deletion. FF·D is additionally blocked by the GrowthBook targeting-
  compatibility gate (§14a.6). Each installs a **global semantic partial
  unique**, never the compact `NULLS NOT DISTINCT` constraint. `·D` gates are
  the weaker compatibility-period gates (zero *active* `unresolved_legacy`;
  `quarantined` may remain if provably query-excluded); the stronger zero-
  `quarantined` / NULL-means-`intentional_global`-exclusively gate belongs to
  R4a.
- **R2, R3, S7·resid** — R2/R3 are runtime authorization-path changes
  (Security/Auth sign-off + canary); S7·resid is schema DDL.
- **R4a** — split. **R4a-1** (reversible) removes **canonical** legacy
  `tenant_id` reads and `TenantContext` authority for `feature_flags` /
  `audit_log_settings`, installs the compact canonical unique, retires the
  `TenantContext.tenantId` alias and the `TENANCY_MODE` shim, and **retains a
  non-authoritative legacy `tenant_id` shadow/compat write plus the legacy
  `UNIQUE(*, tenant_id)` and columns** through the bake period as rollback data
  (encoder decoupled from authority). **One `audit_log_settings.tenant_id` read
  is explicitly EXEMPT**: the bounded data-migration-only `audit_events`
  retention-compat read (introduced at AUD·D) — it survives until R4b-1, is
  never an authorization fallback. For `audit_log_settings`, R4a-1 **freezes
  existing historical `tenant_id` values on canonical UPDATE** (only new
  org-scoped INSERTs get a canonical-`OrganizationId`-derived shadow key;
  `intentional_global` → `NULL`) so the historical event→setting legacy-key
  correspondence the compat read needs is never normalized away.
  **R4a-2-FF** (destructive, **independent of R4b**) — one coordinated step:
  stop the `feature_flags` shadow-write, prove **zero readers AND zero
  writers**, drop `UNIQUE(key, tenant_id)`, `DROP COLUMN feature_flags.tenant_id`.
  **R4a-2-AUD-settings** (destructive, **additionally gated on R4b-1**) — one
  coordinated step, **must not `DROP COLUMN` while any reader of
  `audit_log_settings.tenant_id` remains (including the R4b retention-compat
  read)**: stop the `audit_log_settings` shadow/compat write, prove **zero
  readers AND zero writers** (incl. confirmation R4b-1 removed the compat read),
  drop `UNIQUE(category, tenant_id)`, `DROP COLUMN audit_log_settings.tenant_id`.
  Each destructive sub-step: dedicated destructive-DDL operator gate, further
  bake, signed-off backup/PITR/reconstruction + RTO/RPO. **R4a-1's
  quarantine/unresolved gate is TABLE-SPECIFIC** — the `feature_flags` cleanup
  needs zero `unresolved_legacy` / zero `quarantined` on **`feature_flags`**;
  the `audit_log_settings` cleanup needs zero on **`audit_log_settings`** **plus**
  the §14a.11 legacy-retention-key dependency guard. **`audit_events`
  `unresolved_legacy` / `quarantined` rows do NOT gate R4a-1** (that is R4b-1
  only). There is **no combined all-three-table zero gate**.
- **R4b** — split. AUD·B introduced the `audit_events.tenant_id` dual-write; R4b
  retires it and **removes BOTH sides of the legacy retention-key read
  dependency**. **R4b-1** (reversible) removes the bounded legacy-retention
  compat branch, **all `audit_events.tenant_id` reads**, **and the final
  data-migration-only `audit_log_settings.tenant_id` read**; moves the purge job
  to canonical semantics only — **after R4b-1 there is no retention dependency
  on either legacy audit key**. It retains a non-authoritative
  `audit_events.tenant_id` shadow-write (and the `audit_log_settings` compat/
  shadow write stays until R4a-2-AUD-settings, purely as R4b-1 rollback data).
  **R4b-2** (destructive) — one coordinated step: stop the shadow-write, prove
  **zero readers AND zero writers**, `DROP COLUMN audit_events.tenant_id`; own
  destructive-DDL gate + backup/PITR/reconstruction; expected last of the three.
  **No `DROP COLUMN` while any `audit_events.tenant_id` writer remains.**
  **R4b-1's hard prerequisite is PHYSICALLY ZERO ROWS:** `count(*) = 0` on
  `audit_events` for **both** `ownership_state = 'unresolved_legacy'` and
  `ownership_state = 'quarantined'`, proven by an explicit post-purge count —
  rows are resolved/dispositioned or aged-then-**purged to completion** (the
  final bounded compat purge is run for eligible rows first). "Aged past
  `AUDIT_RETENTION_DAYS_MAX`" only makes a row *eligible* for that purge, never
  proof it is gone; R4b-1 **aborts** if either count is non-zero. Independent of
  R4a-1 and R4a-2-FF; **gates R4a-2-AUD-settings** (via R4b-1).
- **R5** — env/config cleanup only.

The Audit package's schema, dual-write, backfill, and cutover for `audit_events`
and `audit_log_settings` are one coordinated unit: `resolveEffectiveAuditSetting`
joins the two tables, and `DrizzleAuditLogService.record` and the retention purge
must switch to the canonical key **together**, in one release (AUD·D).

### 17a. Global implementation validation baseline (every OZI-71 code slice)

Every OZI-71 code slice runs, at minimum, and must **pass**:

- `pnpm typecheck`
- the repository lint command appropriate for the slice — as a **check**, not a
  mutation (`pnpm lint --fix` is **not** acceptable as validation proof;
  validation must distinguish checks from fixes)
- `pnpm arch:lint`
- `pnpm skott:check:only`
- `pnpm madge`
- the relevant **unit** tests
- the relevant **integration** tests
- **real-Postgres DB tests for every SQL containment / mutation invariant** the
  slice introduces or touches
- `git diff --check`
- the repository's existing architecture-baseline PR gates where required
  (e.g. depcheck, env-schema validation)

**Schema / migration slices** additionally require: generated-SQL inspection;
migration-forward validation; rollback/compatibility validation; Production-safe
DDL review (§ AUD·A checklist, generalised).

**Security-sensitive cutovers** (FF·D, AUD·D, AUD·B, R2, R4a-1, R4b-1)
additionally require: Security/Auth review; a canary; explicit
**inconsistent-tuple** (`ORG_A + TENANT_B` → zero rows **and no global
fallback**) tests; sibling-org isolation; cross-tenant isolation;
platform-global classification tests; and a proof of **no fail-open fallback**
to a legacy scope. For **AUD·B / AUD·D** this includes the **`audit_events`
INSERT-containment matrix** (invariant #11: `INSERT … SELECT FROM organizations
WHERE id = $orgId AND tenant_id = $tenantId` — valid tuple inserts one event;
`ORG_A/TENANT_B` and deleted/non-existent org insert **zero** and create **no**
`intentional_global` event; platform-global inserts `NULL` +
`intentional_global`; no legacy-`tenant_id` authority fallback) and the
**purge-grouping regressions** (§14a.12 — §16 AUD·D tests 1–5).

**Quarantine Disposition Gate outcomes** that are `ownership_state` /
`organization_id` `UPDATE`s (outcomes 1–3) or an archive-then-delete (outcome 4)
are **Production data mutations**: each carries a dry-run, per-row evidence,
explicit operator authorization, before/after counts, idempotency, and an audit
trail; an **outcome-2 reclassification to `intentional_global` on `feature_flags`
/ `audit_log_settings` additionally requires a semantic-impact review +
Security/Product sign-off** (it makes a previously-excluded row a live global
default).

## 18. Rollback / compatibility strategy

*(Amended 2026-09-02.)*

- Every phase up to and including FF·C / AUD·C keeps the old shape
  (`TenantContext`, legacy `tenant_id` columns, `TENANCY_MODE`) readable and
  authoritative in parallel — a revert of any single phase's commit is a plain
  code rollback with no data implication; FF·C / AUD·C are additive-only,
  resumable, idempotent against existing data.
- No canonical query in any package reads an `unresolved_legacy` / `quarantined`
  row as global or as an organization match; those rows also participate in no
  canonical uniqueness constraint.
- Each `·D` slice rolls back by reverting the release and **dropping the global
  partial unique added in that phase** (the scoped partial unique and the legacy
  `UNIQUE(natural_key, tenant_id)` remain — back to the Phase-C constraint set);
  runtime, purge, and admin reads return to the legacy path together; no data
  implication.
- **R4a-1 / R4b-1 are genuinely reversible** because each keeps the legacy
  `tenant_id` column, the legacy `UNIQUE(*, tenant_id)` (R4a-1 only), **and a
  continuously-maintained non-authoritative shadow/compat write** so that
  historical **and** every bake-period row still has a usable legacy
  `tenant_id`. Rollback therefore: revert the code; compact `NULLS NOT DISTINCT`
  unique → the two semantic partial uniques (R4a-1); the legacy unique still
  installs without violation because no shadow value is missing or
  newly-duplicated; **no row-data reconstruction**.
- **Historical retention-key correspondence is preserved across R4a-1.** The
  bounded `audit_events` retention-compat path resolves an unresolved /
  quarantined historical event by string-matching its historical
  `audit_events.tenant_id` against `audit_log_settings.tenant_id`. R4a-1
  therefore (a) **exempts** that one data-migration-only
  `audit_log_settings.tenant_id` read (removed only at R4b-1), and (b)
  **freezes existing `audit_log_settings.tenant_id` values on canonical
  UPDATE** — the audit-settings compat lifecycle must never normalize a
  historical legacy key that an unresolved historical event still needs. Before
  R4b-1, rollback of the retention-compat path always has the historical
  event→setting legacy-key correspondence available.
- **Destructive column drops are not a plain revert.** `R4a-2-FF`
  (`feature_flags.tenant_id`), `R4a-2-AUD-settings` (`audit_log_settings.tenant_id`)
  and `R4b-2` (`audit_events.tenant_id`) each `DROP COLUMN`, which **destroys
  that column's data**. Each coordinated step **first stops the legacy
  `tenant_id` shadow/compat write**, then proves **zero readers AND zero
  writers**, then drops the legacy `UNIQUE(*, tenant_id)` (R4a-2-* only), then
  `DROP COLUMN`. **`R4a-2-AUD-settings` additionally requires R4b-1** (its
  retention-compat read of `audit_log_settings.tenant_id` gone) and must not run
  while any reader remains. **`R4a-2-FF` is independent of R4b.** Additional
  requirements for each: a further bake after the reversible sub-step; explicit
  dedicated destructive-DDL operator authorization; a signed-off **backup /
  point-in-time-recovery or deterministic reconstruction** plan with agreed
  RTO/RPO. Reconstruction from `organization_id` is lossy for historical
  `quarantined` / provider-only / `unresolved_legacy` /
  `organization_owned_orphaned` rows — acknowledged; those values were never
  canonical. **Rollback after a drop requires schema restoration *and* data
  restoration/reconstruction — it is not a simple code revert.**
- **FF / AUD migration phases (FF·A–D, AUD·A–D) never silently or automatically
  delete source rows** — every `·A`/`·B`/`·C`/`·D` operation is additive schema,
  dual/shadow-write, classification, or `ownership_state` reclassification.
- **The Quarantine Disposition Gate DOES mutate Production data** — outcomes 1–3
  are `ownership_state` / `organization_id` `UPDATE`s (each a Production data
  mutation with dry-run, per-row evidence, operator authorization, before/after
  counts, idempotency, audit trail; outcome-2 `→ intentional_global` on
  `feature_flags` / `audit_log_settings` also needs a semantic-impact review +
  Security/Product sign-off), and outcome 4 archives/exports then **deletes** a
  redundant/invalid row under a dedicated destructive-row-disposition gate.
  Never an automatic sweep; never an auto-promotion. Its zero-proofs are
  **per table** — `feature_flags` and `audit_log_settings` each clear on their
  own timeline; `audit_events` clears against R4b-1's physical-zero prerequisite,
  never gating R4a-1.
- Destructive **column** drops (`R4a-2-FF` / `R4a-2-AUD-settings` / `R4b-2`)
  remove columns only (no rows), each under the separately-gated destructive-DDL
  process above.
- **R4b-1 rollback / prerequisite:** R4b-1 removes the legacy-key grouping
  branches and `resolveLegacyAuditRetentionCompat` **only after `count(*) = 0`
  on `audit_events` for `unresolved_legacy` AND `quarantined`** (explicit
  post-purge count, not an "aged past 730d" estimate); it aborts otherwise. It
  stays reversible: the `audit_events.tenant_id` column, its non-authoritative
  shadow-write, and the frozen `audit_log_settings.tenant_id` values remain, so
  reverting R4b-1 restores the compat branch with no row-data reconstruction.
- A rollback that would reopen the Phase 0 sibling-organization containment is
  never acceptable at any slice — Slice 3's cutover re-proves OZI-77's negative
  tests before and after; the FF·D / AUD·D cutovers re-prove the equivalent
  `TENANT_A{ORG_A1,ORG_A2}` / `TENANT_B{ORG_B1}` negative matrix (§16).

## 19. Evidence baselines / SHA traceability

- **Original Phase-1 architecture evidence baseline:**
  `940a600d05faba5cfdf3d9de65126ed24303fe29` (branch
  `ozi-71-tenant-organization-architecture`) — the commit this document's
  original §1–§16 evidence gathering and slice ordering were verified against
  (2026-09-01). Not current `main`; preserved for historical traceability.
- **Final corrective-replan verification baseline:**
  `4116eb432c60d7d74e789db5b8952262c545df39` — current `main` at the time of the
  2026-09-02 program-level corrective replan and the subsequent independent
  reviews (merge of PR #100, "feat/ozi-71-slice-4b-users-datascope"; includes
  completed Slices 1, 2, 3, 4A Invitations, 4B Users). All §14a / §16 (FF & AUD
  packages, R2–R5) / §17 / §18 wording was reconciled against this SHA.
- Verify the actual current `main` SHA again before each implementation slice
  begins; do not treat either baseline above as necessarily current.
