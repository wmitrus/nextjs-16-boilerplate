# Supabase Adapter Architecture Brief

## Objective

Define what would actually be required to add Supabase as a clean future auth provider in this modular monolith without violating current architecture boundaries.

## Architectural Position

Supabase can fit this repository as an **infrastructure auth provider adapter**, not as a shortcut that changes domain ownership.

That means:

- authentication may move from Clerk to Supabase
- provisioning remains app-owned
- onboarding completion remains app-owned
- tenant readiness and membership remain app-owned
- authorization remains app-owned

## What Must Stay Stable

These boundaries should not change in a Supabase implementation:

- `src/core/contracts/identity.ts` remains the provider-agnostic identity contract
- `src/modules/provisioning/*` remains the only write path for user or tenant bootstrap
- `src/security/core/*` remains the server-side readiness and authorization layer
- `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` remains the owner of internal user read or write state

## Required Workstreams

### 1. Provider Infrastructure

Implement `SupabaseRequestIdentitySource.get()` in `src/modules/auth/infrastructure/supabase/SupabaseRequestIdentitySource.ts`.

It must return:

- external user id
- email
- email verification signal if available
- tenant context inputs only if the chosen tenancy mode legitimately supports them

This adapter must translate provider claims only. It must not query domain tables or decide onboarding.

### 2. Session and Request Entry

Replace the current Clerk-specific session establishment path in:

- `src/proxy.ts`
- `src/app/layout.tsx`

with a Supabase-aware equivalent.

This is not just a provider swap. The proxy currently assumes Clerk middleware semantics and the layout currently assumes ClerkProvider semantics.

### 3. UI Delivery Layer

Generalize or replace:

- `src/app/sign-in/[[...sign-in]]/page.tsx`
- `src/app/sign-up/[[...sign-up]]/page.tsx`

Today they are explicitly Clerk-only. A Supabase implementation needs its own delivery-boundary UI, but that UI must remain in `src/app/*` or provider-specific UI modules, not bleed into core or domain contracts.

### 4. Bootstrap Compatibility

Preserve the post-auth contract:

- sign-in lands on a stable route
- app-owned bootstrap runs
- provisioning resolves or creates internal user and tenant state
- onboarding redirects are still based on internal DB truth

`src/app/auth/bootstrap/resolve-bootstrap-outcome.ts` and `src/app/onboarding/actions.ts` must continue to work from provider-agnostic inputs.

### 5. Tenancy Review

If the team uses `TENANCY_MODE=org` with provider-derived tenant context, Supabase needs an explicit story for how external tenant context is represented and trusted.

If that story is weaker than Clerk Organizations, prefer:

- `TENANCY_MODE=single`, or
- `TENANCY_MODE=org` with `TENANT_CONTEXT_SOURCE=db`

until a stronger provider-context design is proven.

## Risks To Avoid

- Do not store onboarding truth only in Supabase auth user metadata.
- Do not bypass `ProvisioningService.ensureProvisioned()`.
- Do not make `src/proxy.ts` depend on direct DB lookups for auth routing decisions.
- Do not introduce Supabase-specific concepts into `src/core/contracts/*`.

## Minimum Safe Migration Sequence

1. Implement the Supabase request identity source.
2. Add provider-specific server/session wiring at the delivery layer.
3. Replace the sign-in and sign-up delivery UI.
4. Validate bootstrap, onboarding, and `/users` guards end to end.
5. Only then consider enabling Supabase in production config.

## Architectural Conclusion

Supabase is a valid future adapter target in this repository, but only as a full provider integration across infrastructure and delivery boundaries. It is not a low-effort config change.
