# Task Plan

## Objective

Determine whether the Neon project-creation option `Auth` should be enabled for this repository's production database setup, and extend that decision with architecture-level guidance on current provider strategy, a future Supabase adapter path, and the relative migration cost of Neon Auth.

## Progress Checklist

- [x] Task workspace initialized
- [x] `plan.md` completed
- [x] `intake.md` completed
- [x] `01 - Architecture Guard - Summary.md` completed
- [x] `02 - Security & Auth - Summary.md` completed
- [x] provider strategy artifact completed
- [x] Supabase adapter architecture artifact completed
- [x] Neon Auth migration brief completed
- [x] `implementation-plan.md` completed
- [x] minimal Neon placeholder provider implementation completed
- [x] implementation-agent hardening pass completed

## Scope

- review the production auth provider actually used by the app
- trace post-auth bootstrap and onboarding ownership
- verify whether auth truth and profile truth live in Clerk, Neon, or the app database
- decide whether Neon built-in auth fits the current implementation
- define which future provider path best fits the current modular seams
- document the minimum safe architecture for a future Supabase adapter
- document why Neon Auth would be a larger migration than Supabase in this repo
- prepare all related auth docs and a minimal Neon adapter placeholder without changing runtime behavior

## Non-Goals

- changing auth providers
- implementing Neon integration changes
- editing runtime code
- speculative migration planning to Neon auth

## Current Status Note

- Live code confirms the active production posture is external-provider auth with Clerk as the implemented provider.
- Live code confirms internal user, tenant, membership, and onboarding truth is app-owned and persisted in Postgres via Drizzle.
- The correct choice for the Neon project-creation screen is to leave Neon `Auth` disabled for this repository.
- The Neon deployment documentation now includes a provider comparison covering Neon Auth, Supabase Auth, and Clerk, plus a roadmap note on future adapter viability.
- Architecture guidance is now recorded for: when to stay on Clerk, why Supabase is the best future adapter candidate, and why Neon Auth is a larger migration topic.
- The repository now includes a failing-fast Neon placeholder adapter and matching status documentation. Neon remains non-ready for runtime use.
- Edge auth composition now matches the declared Neon placeholder provider, with focused unit coverage.

## Recommended Next Step

- No additional specialist is required for this decision.
- If the team later decides to replace Clerk, that should be handled as a separate auth-migration task with `02 - Security & Auth` and `03 - Next.js Runtime` review.
- If the team wants to preserve a low-cost alternative on the roadmap, Supabase is the best fit for a future adapter path in the current repository design.
- `04 - Implementation Agent` has completed the placeholder-hardening pass.
- Switch to `03 - Next.js Runtime` before any real Neon runtime integration beyond placeholders.
