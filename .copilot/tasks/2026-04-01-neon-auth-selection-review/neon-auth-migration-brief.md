# Neon Auth Migration Brief

## Objective

Explain why a future Neon Auth migration would be materially larger than a Supabase adapter implementation in this repository.

## Executive Assessment

Neon Auth is not just missing implementation in the current codebase.

It is represented in the repository's auth-provider contract only as a placeholder-only target.

That makes Neon Auth a **new provider integration plus architectural expansion**, whereas Supabase is a **pre-modeled but unimplemented provider path**.

## Why Neon Auth Is Larger

### 1. It is not in the provider contract

The supported external provider union in `src/core/contracts/identity.ts` is:

- `clerk`
- `authjs`
- `supabase`
- `neon`

Neon is represented here only as a failing-fast placeholder.

The remaining work is still larger than Supabase because the runtime, delivery, and session boundaries are not implemented.

### 2. It has no adapter seam in the current repo

There is no Neon request identity source, no Neon-specific session wiring, and no Neon-aware UI delivery surface.

Supabase already has a placeholder adapter file. Neon does not.

### 3. The UI and routing path are currently Clerk-specific

The delivery layer currently assumes:

- `ClerkProvider` in `src/app/layout.tsx`
- Clerk-specific sign-in and sign-up routes
- Clerk middleware semantics in `src/proxy.ts`

Moving to Neon Auth would require a larger delivery-layer rewrite than filling the existing Supabase placeholder.

### 4. Neon Auth changes the platform posture, not just the provider

Neon Auth is tightly coupled to Neon as the data platform and emphasizes database-auth co-location, branch-scoped auth state, and direct SQL visibility into auth data.

This repository currently treats:

- the auth provider as external identity authority
- the app database as internal user and onboarding truth

That separation is intentional and currently works.

Any Neon Auth adoption would need a deliberate architectural decision about whether to keep or narrow that separation.

## Architectural Risks

- accidental duplication between Neon auth tables and app-owned user state
- pressure to move onboarding or tenant truth into provider-managed records
- tighter coupling between database vendor and auth model
- larger blast radius in `src/app`, `src/proxy.ts`, env schema, and provider abstractions

## When Neon Auth Could Still Be Rational

Neon Auth could be worth evaluating later if the team explicitly wants:

- tighter database plus auth consolidation
- branch-scoped auth state aligned with branch-scoped databases
- a lower-cost auth option with high free MAU limits

But that evaluation should be treated as a **platform redesign task**, not an adapter placeholder task.

## Recommendation

- keep Neon Auth out of the current roadmap as an "easy next provider"
- if the team wants a future low-cost alternative, prioritize Supabase first
- revisit Neon Auth only in a dedicated auth-platform evaluation with Security & Auth, Next.js Runtime, and Architecture Guard review
