# Auth Provider Strategy: Clerk Now vs Supabase Later

## Objective

Provide an architecture-level decision framework for whether this repository should stay on Clerk or invest in a future Supabase auth adapter, using the current modular-monolith design as the source of truth.

## Current Architectural Reality

This repository is not provider-neutral in runtime behavior today, even though it exposes a provider abstraction.

What is provider-neutral:

- the identity contract in `src/core/contracts/identity.ts`
- the internal identity lookup boundary
- the auth module factory in `src/modules/auth/index.ts`
- the provisioning input shape and provider-tagged identity mapping tables

What is still Clerk-shaped in production behavior:

- the root layout provider shell in `src/app/layout.tsx`
- the request-entry auth path in `src/proxy.ts`
- the implemented request identity source in `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
- the sign-in and sign-up UI routes in `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx`
- the checked-in environment defaults in `src/core/env.ts` and `.env.example`

The correct architectural reading is:

- **Clerk is the current production provider**
- **the app database is the source of truth for provisioning, onboarding, tenant, and membership readiness**
- **the auth abstraction is real, but only partially realized for alternate providers**

## Recommendation

### Stay on Clerk when:

- the goal is production delivery with minimum blast radius
- the team wants to preserve the current bootstrap and onboarding behavior
- the team values prebuilt auth UI and current integration maturity over vendor consolidation
- the auth work is not the product differentiator right now

### Consider a future Supabase adapter when:

- the team wants to reduce provider spend or consolidate more platform capabilities
- the team is prepared to invest in a real provider migration, not a config toggle
- the team wants an alternative that already fits the current provider contract better than Neon Auth

## Why Supabase Is The Best Future Alternative In This Repo

Supabase is the only alternative already anticipated by the repository's provider contract.

Evidence:

- `ExternalAuthProvider` already includes `supabase` in `src/core/contracts/identity.ts`
- `SupabaseRequestIdentitySource` already exists as a placeholder in `src/modules/auth/infrastructure/supabase/SupabaseRequestIdentitySource.ts`
- `createAuthModule()` already branches on `AUTH_PROVIDER='supabase'` in `src/modules/auth/index.ts`

That means Supabase is a **planned extension seam** in the current architecture.

It is still not implemented, but it is aligned with the existing modular boundary shape.

## Why Neon Auth Is Not The Same Kind Of Future Option

Neon Auth is not represented in the current provider union, adapter surface, or UI path.

Architecturally, adding Neon Auth would require:

- extending the provider contract itself
- adding a new infrastructure adapter family
- generalizing or replacing the current Clerk-specific UI flow
- revalidating proxy behavior, session handling, and post-auth bootstrap assumptions

That is a larger provider integration, not a small future adapter placeholder.

## Architectural Guardrails

- Keep authentication separate from provisioning and authorization.
- Do not move onboarding truth into provider metadata just because a provider can store profile data.
- Do not let any provider bypass `/auth/bootstrap/start` unless the bootstrap contract itself is redesigned.
- Do not couple domain logic to provider SDK payloads outside infrastructure adapters.

## Decision

- **Production now**: stay on Clerk
- **Future low-cost alternative to keep on roadmap**: Supabase
- **Do not treat Neon Auth as the next easy adapter**
