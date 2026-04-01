# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-04-01-neon-auth-selection-review`
- Task Objective: extend the Neon auth selection review with architecture-level guidance on current provider strategy, a future Supabase adapter path, and why Neon Auth would be a larger migration
- Current Run Scope: modular-monolith boundary review, provider-strategy review, future adapter feasibility assessment
- Status: COMPLETED
- Last Updated: 2026-04-01
- Related Control Artifacts: `plan.md`, `intake.md`, `02 - Security & Auth - Summary.md`

## Scope Handled

- modules / layers reviewed:
  - `src/app`
  - `src/core/contracts`
  - `src/core/runtime`
  - `src/modules/auth`
  - `src/modules/provisioning`
  - `src/modules/user`
  - `src/security/core`
- change surface reviewed:
  - current provider strategy
  - future Supabase adapter fit
  - future Neon Auth migration size and architectural implications
- architecture questions in scope:
  - whether the auth abstraction is mature enough for alternate providers
  - which future provider path best fits the current modular seams
  - what boundaries must remain fixed in any provider migration

## Inputs Reviewed

- code paths reviewed:
  - `src/core/contracts/identity.ts`
  - `src/core/runtime/bootstrap.ts`
  - `src/app/layout.tsx`
  - `src/app/sign-in/[[...sign-in]]/page.tsx`
  - `src/app/sign-up/[[...sign-up]]/page.tsx`
  - `src/proxy.ts`
  - `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
  - `src/app/onboarding/actions.ts`
  - `src/app/onboarding/layout.tsx`
  - `src/app/users/layout.tsx`
  - `src/modules/auth/index.ts`
  - `src/modules/auth/infrastructure/supabase/SupabaseRequestIdentitySource.ts`
  - `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`
  - `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.ts`
- docs / ADRs / prompts reviewed:
  - `AGENTS.md`
  - `docs/ai/general/00 - Agent Interaction Protocol.md`
  - `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
  - `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
  - `docs/features/DEPLOY-neon.md`
- earlier task artifacts reviewed:
  - `plan.md`
  - `intake.md`
  - `02 - Security & Auth - Summary.md`

## Actions Performed

- repository inspection performed: yes
- boundary checks performed: yes
- dependency / DI review performed: yes
- docs-vs-code checks performed: yes

## Current-State Findings

- Confirmed:
  - the repo has a real provider abstraction, but only Clerk is fully realized in delivery and runtime paths
  - Supabase is the only future provider already anticipated by the provider contract and adapter directory structure
  - provisioning, onboarding, and readiness are correctly app-owned and must remain so regardless of provider
  - Neon Auth would require a new provider integration rather than a narrow adapter implementation
- Risks:
  - treating any future provider change as an env-toggle would understate the delivery and runtime blast radius
  - collapsing onboarding or tenant truth into provider metadata would violate current ownership boundaries
  - introducing Neon Auth casually would increase coupling between auth strategy and database vendor choice
- Drift:
  - the code advertises `authjs` and `supabase` in the provider contract, but only Clerk is currently implemented end to end

## Boundary And Dependency Assessment

- module ownership assessment:
  - authentication provider integration belongs in `src/modules/auth` plus delivery-layer UI in `src/app`
  - provisioning and onboarding remain owned by `src/modules/provisioning`, `src/modules/user`, and `src/security`
- dependency direction assessment:
  - current dependency direction is acceptable: delivery depends on auth and security modules; core contracts remain provider-agnostic
  - future provider implementations must continue to depend downward into contracts, not push provider SDK details into core or domain logic
- DI / composition assessment:
  - `src/core/runtime/bootstrap.ts` and `createAuthModule()` are the correct composition seams for swapping provider implementations
  - the provider swap is not complete today because the delivery layer is still Clerk-specific
- cross-module coupling assessment:
  - Clerk coupling exists mainly in delivery and infrastructure boundaries, which is acceptable
  - the main architectural risk is letting provider-specific behavior leak into provisioning or readiness logic

## Architectural Decisions / Constraints

- approved architectural constraints:
  - keep Clerk as the current production provider
  - treat Supabase as the best future adapter candidate if a lower-cost alternative is desired
  - treat Neon Auth as a future platform-migration topic, not an easy adapter placeholder
  - preserve app-owned provisioning, onboarding, tenant, and authorization truth
- rejected directions:
  - representing Neon Auth as a low-effort future adapter in the current architecture
  - moving provider-specific identity or session semantics into core contracts beyond the existing provider discriminant
  - bypassing bootstrap or users-guard flows in a future provider migration
- follow-up architectural guardrails:
  - any future provider work must start with provider infrastructure and delivery boundaries, not domain changes
  - any migration off Clerk requires Security & Auth plus Next.js Runtime review before implementation

## Artifact Synchronization

- `plan.md` updates:
  - should reflect that the task now includes provider strategy and future-path architecture guidance
- `intake.md` updates:
  - should reflect that the Neon setup answer is resolved and the task now includes longer-term architectural guidance
- `implementation-plan.md` updates:
  - not needed for this analysis-only task
- specialist artifact updates:
  - this summary created as the persistent Architecture Guard artifact

## Open Questions / Blockers

- unresolved questions:
  - none for the current Neon setup decision
  - any future provider migration still requires explicit product and runtime scoping
- blockers:
  - none
- evidence still needed:
  - none for the architecture guidance delivered in this task

## Handoff Notes

- what the next agent should rely on:
  - Clerk remains the correct production provider today
  - Supabase is the best future low-cost adapter candidate in the current architecture
  - Neon Auth is a larger provider and platform migration than Supabase in this repo
- what should not be re-decided without new evidence:
  - do not move onboarding or tenant truth out of app-owned Postgres tables
  - do not frame Neon Auth as a small follow-up adapter
  - do not treat alternate providers as fully supported just because they appear in the provider union
- recommended next specialist or step:
  - no immediate specialist required
  - if the team chooses to pursue Supabase later, route first to `02 - Security & Auth` and `03 - Next.js Runtime`

## Update Log

### Update Entry

- Date: 2026-04-01
- Trigger: user requested the three architecture follow-ups to be done professionally according to the repository's modular-monolith pattern
- Summary of change: added architecture artifacts covering provider strategy, Supabase adapter feasibility, and Neon Auth migration scope; recorded the architecture-level guidance and constraints
- Sections refreshed: all
