# 02 - Architecture Guard — OZI-71 Phase 1 Tenant/Organization Architecture

## Final verdict

**GO — Data-driven topology + narrow deployment capability/policy flags
(Alternative C).**

Chosen model: tenant→organization is a strict **1:N ownership relationship**
(`organizations.tenant_id NOT NULL` FK; every organization has exactly one
tenant; not many-to-many; no join table); tenant/organization topology is
derived entirely from those FK rows and `memberships` rows; `TENANCY_MODE`
is retired as a runtime security-mode switch; what legitimately remains as
configuration is narrow, explicitly non-security bootstrap/capability
policy (per-tenant `tenant_attributes.maxOrganizations`/`maxUsers`, already
in schema, plus a named bootstrap-policy choice for first-login
provisioning). `AUTH_PROVIDER` remains deployment configuration for a
legitimate, orthogonal reason (which identity provider is wired) and is
untouched by this decision.

`AccessContext` (the server-verified actor + verified working-context
selection) and `DataScope` (the authoritative scope for one
operation/resource class, derived server-side per request) are kept as two
separate concepts — an actor never permanently "owns" a scope. Full
contract and derivation rules in `plan.md` §7.

## Why the chosen architecture wins

- It matches the evidence, not a guess: every one of the four `TenantResolver`
  implementations already collapses `tenantId === organizationId` today;
  three of them (`single`, `personal`, and provisioning's un-ordered
  single-mode branch) are separately-coded shortcuts duplicating what the
  fourth (`org`+`db`) already does correctly and generally. Retiring the
  three shortcuts removes the defect class (OZI-68) instead of patching one
  instance of it.
- It is the only alternative that supports all four required deployment
  shapes (one tenant→one organization; one tenant→many organizations; many
  tenants→one organization each; many tenants→many organizations each) on
  the single existing 1:N `organizations.tenant_id` FK, natively, because
  topology is read from data, never selected by a global flag that
  necessarily applies to an entire deployment.
- It keeps a narrow, honest seam for genuine deployment/product policy
  (quota, bootstrap behavior) without smuggling authorization decisions
  into that seam — the failure mode Alternative B would otherwise
  re-invent ad hoc (which is exactly how the OZI-68 divergence bug was
  produced: an un-named policy decision embedded directly in a query).
- It reuses proven, already-accepted enforcement mechanics (OZI-77's
  scope-AND-ed-with-requested-id-in-the-same-SQL-statement pattern) rather
  than inventing a new one, minimizing the real risk introduced by the
  redesign itself.
- `tenant_attributes.maxOrganizations` already exists in schema, unread by
  any code path — the chosen architecture's quota mechanism is not new
  surface area, only new enforcement of an existing, previously-designed
  column.

## Why alternatives are rejected

- **A (keep `TENANCY_MODE`, repair branches)**: rejected because it cannot
  support all four topology shapes in one deployment by construction (one
  global env var selects one mode), and it permanently encodes the
  tenantId/organizationId collapse across three resolvers that must be kept
  in lockstep forever — the exact shape that already produced OZI-68.
- **B (fully data-driven, zero policy flags)**: rejected not because
  data-driven topology is wrong (it is the correct core), but because a
  real bootstrap-policy decision ("does first login auto-provision a
  personal organization") still has to live somewhere; refusing to name it
  as an explicit, narrow flag only pushes it into unnamed per-route logic —
  which is precisely how the current divergent-query bug was created.
  Alternative C keeps B's core correctness and closes this one gap.

## Security assessment

- Preserves every Phase 0 invariant unchanged: OZI-77's containment
  (`AdminOrganizationsScope`) is the first real consumer migrated onto the
  canonical `DataScope` in Slice 3, with its existing real-Postgres negative
  tests (sibling denial, cross-tenant denial, platform active-tenant re-scoping)
  re-proven before the cutover is considered complete — Phase 0's security
  boundary is never weakened, only generalized.
- The canonical `AccessContext`/`DataScope` design makes the specific defect
  class Phase 0 contained (organizationId silently authorizing tenant-wide
  access) a compile-time impossibility for new code via branded types,
  rather than relying solely on code review to catch it again.
- No slice grants platform-admin implicit unbounded scope: every operation,
  including platform-admin ones, still declares and re-resolves an explicit
  target scope from the database at the moment of use (Slice 5 explicitly
  carries this rule forward from OZI-77's `active-tenant` resolution).
- The only slice that mutates existing Production data (Slice 8, backfill)
  is isolated, additive-only, dry-run-first, idempotent, and requires its
  own separate operator authorization — consistent with this repository's
  existing Production-mutation gating (OZI-79/OZI-78 precedent).
- Runtime-authorization-path changes (Slices 5, 6, 9) are explicitly flagged
  as requiring Security/Auth sign-off and canary validation before
  Production rollout, mirroring OZI-77/OZI-78's own gating rather than
  treating a redesign as exempt from it.

## Migration feasibility

Feasible as an incremental, production-safe sequence with no big-bang
rewrite:

- Slices 1-2 are pure additive types/construction — zero runtime risk,
  fully reversible by deletion.
- Slices 3-4 migrate existing, already-tested consumers one surface family
  at a time, each independently revertible.
- Slice 5 (resolver retirement) is the highest-risk runtime change and is
  correctly sequenced last among the behavior changes, after every consumer
  already reads the new shape — minimizing the blast radius of the one slice
  that actually changes authorization-path behavior.
- Slice 7/8 (schema correction + backfill) follow the standard
  additive-column → backfill → remove-compatibility → drop-old pattern this
  repository already uses elsewhere, never an in-place rename.
- Every slice states its own rollback strategy; only Slice 8 carries genuine
  data-mutation risk, and it is scoped to be the smallest possible mutation
  (write one derived column from an already-validated existing value).

No blocker identified in schema, provider integration, or existing test
infrastructure that would prevent starting Slice 1 immediately.

## Phase 1 readiness

Ready to start. All evidence required to begin Slice 1 (branded types +
the separated `AccessContext` / `DataScope` contract) is already in hand:
the current collapse is fully characterized, the target shape is fully
specified in `plan.md` §7, and no open question in `plan.md` §14 blocks any
of Slices 1-4. Slices 5-6 have their own explicit pre-conditions (every
consumer deriving its `DataScope` from `AccessContext` first) already
sequenced correctly.

## Blockers

None. All open questions in `plan.md` §14 are explicitly non-blocking for
starting implementation; each is bound to the specific later slice it
actually affects (Slice 6 for self-service scope questions, Slice 7 for
schema-rename decisions, Slice 8-adjacent for the provider-mapping
anomalies).

## Recommended first implementation slice

**Slice 1 — introduce branded `TenantId`/`OrganizationId`/`UserId` types and
the canonical contract with `AccessContext` (actor + verified working
context) and `DataScope` (per-operation, server-derived) kept separate**
(`plan.md` §16, item 1). It is pure, additive, has no runtime consumer yet,
requires no schema change, no Production authorization gate, and immediately
starts closing the compile-time collapse risk (invariant #9) that every
subsequent slice depends on.
