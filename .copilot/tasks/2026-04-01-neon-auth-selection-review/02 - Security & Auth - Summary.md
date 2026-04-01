# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-04-01-neon-auth-selection-review`
- Task Objective: decide whether Neon built-in `Auth` should be enabled for the production Neon database project used by this repository
- Current Run Scope: auth-flow tracing, trust-boundary review, provider-isolation review, deployment decision
- Status: COMPLETED
- Last Updated: 2026-04-01
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- auth surfaces reviewed:
  - `src/app/layout.tsx`
  - `src/proxy.ts`
  - `src/modules/auth/index.ts`
  - `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
  - `src/app/sign-in/[[...sign-in]]/page.tsx`
  - `src/app/sign-up/[[...sign-up]]/page.tsx`
- authorization and onboarding surfaces reviewed:
  - `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
  - `src/app/auth/bootstrap/start/route.ts`
  - `src/app/onboarding/layout.tsx`
  - `src/app/onboarding/actions.ts`
  - `src/app/users/layout.tsx`
  - `src/security/core/security-context.ts`
  - `src/security/core/node-provisioning-access.ts`
- trust-boundary questions in scope:
  - where identity is established
  - where onboarding and provisioning truth live
  - whether Neon auth is an active or compatible provider in the current app design

## Inputs Reviewed

- code paths reviewed:
  - `.env.example`
  - `src/core/env.ts`
  - `src/core/runtime/bootstrap.ts`
  - `src/proxy.ts`
  - `src/modules/auth/index.ts`
  - `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
  - `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`
  - `src/modules/auth/infrastructure/supabase/SupabaseRequestIdentitySource.ts`
  - `src/modules/auth/infrastructure/drizzle/schema.ts`
  - `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`
  - `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`
  - `src/app/auth/build-provisioning-input.ts`
  - `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
  - `src/app/auth/bootstrap/start/route.ts`
  - `src/app/onboarding/layout.tsx`
  - `src/app/onboarding/actions.ts`
  - `src/security/core/security-context.ts`
- security/auth docs reviewed:
  - `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
  - `docs/features/DEPLOY-neon.md`
- earlier task artifacts reviewed: none

## Actions Performed

- identity flow tracing performed: yes
- authorization enforcement review performed: yes
- tenant / org context review performed: yes
- sensitive-data exposure review performed: limited to trust-boundary and provider-authority concerns relevant to the decision

## Current-State Findings

- Confirmed:
  - the live implementation is Clerk-driven when `AUTH_PROVIDER=clerk`, and that is the default checked-in production posture
  - post-auth landing is routed through app-owned bootstrap, not directly trusted from provider state
  - internal user, tenant, membership, and onboarding truth are persisted in the application database through Drizzle-backed repositories and provisioning logic
  - the repo models external identity mapping as `provider + external id -> internal id`, which assumes one active external provider authority per runtime configuration
  - the app does not contain a Neon auth provider adapter or Neon-auth-specific request identity source
  - Supabase is the only reviewed alternative that already has a placeholder in the provider contract and adapter surface, even though it is not implemented yet
- Risks:
  - enabling Neon built-in auth would create a second identity authority that the current runtime does not consume
  - enabling Neon auth could create operator confusion about whether user profiles or onboarding truth should come from Neon or the app database
  - choosing Neon auth on the setup screen would be architecturally inconsistent with the current Clerk bootstrap and provisioning flow
- Drift:
  - the repo exposes provider abstraction names beyond Clerk, but the live non-Clerk request identity sources are not implemented, so the practical runtime posture is Clerk-first rather than provider-neutral in production today

## Trust Boundary Assessment

- where identity is established:
  - Clerk establishes identity in UI and request flow
  - request identity is read from Clerk claims and passed into app-owned provisioning and guard layers
- where authorization is enforced:
  - server-side inside the app, through security context, node provisioning access checks, tenant resolution, and authorization services
- where tenant or org context is derived:
  - from application config and app-owned tenant resolution rules, with provider claims used only where configured
- what claims or inputs are trusted:
  - external provider identity claims are used as inputs to the app
  - internal user readiness, onboarding completion, membership, and tenant truth come from the application database

## Sensitive Data And Exposure Notes

- logging / telemetry review:
  - no Neon-auth-specific telemetry path exists in the app
- response exposure review:
  - not central to this decision
- client exposure review:
  - Clerk-specific UI and redirects are exposed to clients; Neon auth is not
- cache exposure review:
  - not central to this decision, but auth and onboarding state remain server-enforced and DB-backed

## Security Decisions / Constraints

- approved controls or constraints:
  - keep Neon as the database only for this deployment step
  - keep auth authority with Clerk for the current production setup
  - keep onboarding and provisioning truth in the app database
  - document Supabase, not Neon Auth, as the lower-friction future adapter candidate if the team wants a second provider path on the roadmap
- rejected directions:
  - enabling Neon `Auth` during project creation for the current app
  - treating Neon auth profile sync as interchangeable with the app's internal bootstrap and onboarding records
  - introducing a second auth authority without a dedicated migration task
- required enforcement points:
  - continue routing authenticated users through `/auth/bootstrap/start`
  - continue enforcing readiness from internal DB state, not database-vendor auth features

## Artifact Synchronization

- `plan.md` updates:
  - created and marked complete for this analysis-only task
- `intake.md` updates:
  - created and resolved with a concrete recommendation
- `implementation-plan.md` updates:
  - not needed for this decision-only task
- specialist artifact updates:
  - this summary created as the persistent Security & Auth artifact

## Open Questions / Blockers

- unresolved questions:
  - none for the immediate Neon setup choice
- blockers:
  - none
- evidence still needed:
  - none unless the team intends to migrate off Clerk

## Handoff Notes

- what the next agent should rely on:
  - the correct Neon setup choice is to leave `Auth` disabled
  - Neon is being introduced here as the production Postgres provider, not as the app auth authority
- what should not be re-decided without new evidence:
  - do not enable a second auth system just because Neon offers it
  - do not treat provider-synced profiles as a substitute for the app's provisioning and onboarding truth
- recommended next specialist or step:
  - no additional specialist needed for this question

## Update Log

### Update Entry

- Date: 2026-04-01
- Trigger: user asked for a code-backed architectural decision on whether to enable Neon built-in auth during production database setup
- Summary of change: traced the live auth, bootstrap, provisioning, onboarding, and identity-mapping flow; concluded Neon `Auth` should remain disabled for the current implementation; and documented provider comparison guidance plus future adapter viability notes
- Sections refreshed: all
