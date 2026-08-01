# Intake

## Objective

- Review the design relationship between Administration `Roles`, `RBAC & Policies`, and `Teams` for the AuthJS track.
- Decide whether the design should be created at once because the three features are connected, or whether they should be designed separately.

## User Request Summary

- The next administration step for AuthJS is managing roles.
- Review the roles design together with `RBAC & Policies` and `Teams`.
- Decide whether they should be designed together because they are connected.
- Recommend the best way forward.

## Scope

- Current repository structure, contracts, schemas, and docs that define organizations, roles, memberships, policies, and admin access.
- Delivery sequencing recommendation for design and later implementation.

## Non-Goals

- No implementation in this step unless later explicitly requested.
- No broad runtime or UI refactor.
- No new validation surface unless a specialist deems it necessary.

## Acceptance Criteria

- A clear recommendation is made on whether to design `Roles`, `RBAC & Policies`, and `Teams` together or separately.
- The recommendation is justified by repository architecture and security constraints.
- The dependency order between the three surfaces is explicit.
- Residual risks and guardrails are documented.

## Inputs Reviewed

- `AGENTS.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- `docs/ai/general/LEANTIME_AUTOMATION.md`
- `src/app/admin/page.tsx`
- `src/app/admin/layout.tsx`
- `src/modules/authorization/infrastructure/drizzle/schema.ts`
- `src/modules/authorization/domain/AuthorizationService.ts`
- `src/core/contracts/repositories.ts`
- `docs/features/22 - RBAC Baseline.md`
- `docs/features/23 - ABAC Foundation.md`
- `docs/features/34 - Admin Bootstrap.md`
- `docs/feature-desings/01 - Final Auth, Authorization and Provisioning Design.md`

## Readiness Checklist

- [x] Repository context loaded
- [x] Admin UI surface inspected
- [x] Authorization schema inspected
- [x] Authorization design docs inspected
- [x] Leantime task created and linked
- [x] Architecture review captured
- [x] Security/auth review captured
- [x] Final recommendation recorded

## Open Questions

- Should `Teams` be a first-class model now, or is current `organizations` the intended operational unit behind the UI label?
- Should custom roles be introduced before the repository has a settled membership-assignment UX?
- Should policy editing be exposed only after role lifecycle invariants are defined server-side?

## Initial Assessment

- Current code suggests that `Roles` and `RBAC & Policies` are directly coupled through the existing `roles`, `memberships`, and `policies` schema.
- `Teams` appears conceptually adjacent, but the repository currently treats `organizations` as the operational unit that owns memberships, roles, and policies.
- That makes `Teams` a structural decision, while `Roles` and `RBAC & Policies` are already within an established authorization model.

## Security/Auth Recommendation

- Recommended delivery shape: integrated design pass with staged implementation.
- Reason: the current trust model couples role definition, membership assignment, invitation issuance, and policy evaluation through organization-owned DB state, so exposing any one of these as an apparently independent admin page would risk misleading operators about actual authority and side effects.
- First safe slice: a narrowly scoped Roles surface can ship first only if it is explicitly organization-scoped, server-authoritative, and limited to invariants that do not require policy editing or a new team model.

## Architecture Recommendation

- Recommended delivery shape: one integrated design package for `Roles`, `RBAC & Policies`, and `Teams`, followed by phased GUI implementation.
- Reason: `Roles` and `RBAC & Policies` are two views over one authorization subsystem, while `Teams` is not yet a first-class modeled domain in code. Treating them as three separate page-design efforts would push unresolved semantics into the delivery layer.
- Required terminology decision: determine whether the near-term page should be `Organizations` rather than `Teams` unless a separate team abstraction is intentionally being introduced.

## Final Sequencing Recommendation

- Stage 0: settle terminology and scope first; resolve whether `Teams` means organizations or a new structural concept.
- Stage 1: ship an organization-scoped admin container or read-only overview that anchors memberships, roles, invitations, and policy ownership in the right scope.
- Stage 2: ship `Roles` management with explicit guardrails around system roles and organization ownership.
- Stage 3: ship `RBAC & Policies` only after role lifecycle, invite side effects, and policy-editing constraints are fixed.
- Stage 4: ship a separate `Teams` surface only if a real team domain is explicitly designed.

## Terminology Decision

- Near-term compatibility decision: use `Organizations` as the admin surface label.
- `Teams` remains deferred until the repository has a real team model separate from organizations.
- Admin card copy should reflect organization-scoped ownership, not tenant-wide or team-specific semantics.

## Design Package Status

- The Organizations-first design has been expanded beyond the initial brief into a fuller package covering canonical routes, V1 read APIs, authority rules, compatibility notes, and downstream sequencing.
- See `organizations-admin-design-package.md` in this task folder for the current full draft.
- The package now explicitly requires the shared ResponseService pattern for normal JSON route handlers so API shape is not left implicit.
- The implementation now extends beyond the original design-only intake: nested organization detail, roles, invitations, guarded custom-role lifecycle, and a first read-only RBAC visibility page are all in place.
- The RBAC slice now also includes its first constrained mutation: organization-scoped policy creation for existing roles, limited to known resources and actions and with no free-form conditions.

## Blocking Notes

- Leantime tracking is now synchronized under milestone `72` (`Leantime Artifact Hygiene And Full Audit`) with task `84` (`Deliver admin organizations RBAC and memberships`), closed with `6.00 h` logged on `2026-07-12`.
