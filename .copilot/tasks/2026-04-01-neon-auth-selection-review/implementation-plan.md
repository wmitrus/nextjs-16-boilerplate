# Implementation Plan

## Objective

Prepare the repository for future Neon Auth support at the contract and documentation level only, without introducing runtime behavior changes.

## Scope

- add a Neon placeholder provider to the auth-provider contract
- add a minimal failing-fast Neon request identity adapter stub
- add matching placeholder tests
- update auth-status documentation so Neon is clearly marked as placeholder-only
- keep edge auth-module wiring consistent with the declared placeholder provider set

## Out Of Scope

- Neon session handling
- Neon sign-in/sign-up UI
- `src/proxy.ts` runtime integration
- layout provider integration
- bootstrap or onboarding behavior changes

## Checklist

- [x] extend provider contract to include `neon`
- [x] add `NeonRequestIdentitySource` placeholder
- [x] add placeholder test coverage
- [x] update auth module wiring for placeholder provider selection
- [x] update runtime status documentation to mark Neon as not ready yet
- [x] align edge auth-module wiring with the Neon placeholder provider
- [ ] hand off to Next.js Runtime review for real provider integration only if the team chooses to build it

## Handoff Trigger

Switch to another agent only when you want to move beyond placeholders into actual runtime integration.

Recommended next agent at that point:

- `03 - Next.js Runtime` for the concrete session, proxy, and App Router integration shape

Required parallel or preceding reviews when that starts:

- `02 - Security & Auth` for trust-boundary and provider-isolation review
- `04 - Implementation Agent` after the runtime shape is approved
