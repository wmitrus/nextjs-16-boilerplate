# Auth Flow Safety

This repository has strict, repository-specific auth/bootstrap/onboarding rules. Use them instead of generic Clerk or Next.js assumptions.

## Source Of Truth

- Clerk handles authentication and session establishment.
- The database is the source of truth for provisioning, tenant membership, and onboarding completion.
- Any cookie such as `__onboarding_pending` is only a transient routing hint, never business truth or authorization truth.

## Middleware And Routing Boundaries

- Middleware-equivalent behavior lives in `src/proxy.ts`.
- Do not add raw ad hoc auth/onboarding branching directly in `src/proxy.ts` when the logic belongs in the existing auth/security middleware abstractions.
- Edge middleware must not depend on DB reads for onboarding decisions.
- The hot-path onboarding redirect decision should be resolved before heavy streaming RSC trees whenever possible.

## Hard Auth-Flow Rules

- Do not use `UsersLayout` or other streaming layouts as the primary post-SSO onboarding redirect orchestrator.
- Do not treat `src/app/users/layout.tsx` as the hot-path redirect boundary after sign-in/sign-up.
- Do not mutate cookies in `page.tsx` or `layout.tsx`; mutation is legal only in Route Handlers or Server Actions.
- Do not use routing-hint cookies as authoritative onboarding state.
- Always sanitize forwarded `redirect_url` values with `sanitizeRedirectUrl()`.
- Keep server-side enforcement authoritative; UI checks are not enough.

## Required Review Context

When a PR touches auth/bootstrap/onboarding/private-route behavior, review against:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

At minimum, think in terms of the matrix scenarios around:

- post-auth bootstrap landing
- onboarding-required routing
- onboarding submit and landing on `/users`
- direct `/users` access before and after onboarding
- cookie hint legality and cleanup
- `/users -> /onboarding` race regressions
