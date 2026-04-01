# Task Intake

## Objective

Answer a deployment-time product choice in Neon, then extend that answer with architecture guidance on future auth-provider strategy for this repository.

## User Constraint

- the decision must be based on the actual repository auth flow and provisioning design
- no guessing or speculative assumptions
- production database setup is being prepared now

## Source of Truth

- repository code
- auth-flow repository guidance
- deployment documentation only where it matches code

## Evidence Targets

- active auth provider configuration
- sign-in and sign-up flow ownership
- request identity establishment
- bootstrap and onboarding routing
- internal provisioning and profile persistence
- identity mapping schema
- provider contract shape and adapter seams
- delivery-layer coupling to the active provider

## Decision To Resolve

- choose whether Neon `Auth` should be enabled or left disabled during Neon project creation
- determine which future low-cost auth path best fits the current architecture
- determine whether Neon Auth is a small future adapter or a larger migration topic
- determine whether a placeholder-only Neon adapter can be added safely now

## Resolved Outcome

- Neon `Auth` should be left disabled for this repository's current production setup
- Clerk remains the correct production provider today
- Supabase is the best future adapter candidate if the team wants a lower-cost alternative on the roadmap
- Neon Auth should be treated as a larger future platform and provider migration, not an adapter-only follow-up
- a placeholder-only Neon adapter is safe now if it fails fast and is documented as non-ready

## Why This Is Resolved

- the implemented provider is Clerk
- the runtime auth flow is Clerk-driven from UI to proxy to bootstrap
- internal user and onboarding truth live in the application database, not provider-synced Neon auth tables
- enabling Neon auth would add a second identity authority that the app does not consume
- the provider contract and folder structure already anticipate Supabase, but not Neon Auth
- the current delivery layer is still Clerk-specific, which makes any provider migration real work rather than a config toggle
- a placeholder can still be added safely at the infrastructure seam if it does not introduce runtime trust assumptions
