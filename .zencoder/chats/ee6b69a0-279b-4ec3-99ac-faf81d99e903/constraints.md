# Feature Constraints — Phase 7: AuthJS Adapter

**Plan step**: Feature Constraints
**Date**: 2026-04-20

Sources:

- `feature-intake.md`
- `architecture-review.md`
- `security-review.md`
- `runtime-review.md`

---

## Architecture Constraints

1. `auth.config.ts` MUST be Edge-safe — no Node-only imports (no bcrypt, no DB)
2. `auth.ts` is Node-only — extends `auth.config.ts`; bcrypt and credentials provider live here
3. `AuthJsEdgeIdentitySource` MUST only import from `auth.config.ts`, never `auth.ts`
4. `AuthJsRequestIdentitySource` imports `auth.ts` (Node runtime only)
5. All new authjs files live in `src/modules/auth/infrastructure/authjs/`
6. No cross-provider dependencies — `authjs/` must never import from `clerk/`
7. `WorkspaceSwitcher` changes are additive only — Clerk branch must remain unchanged
8. DB-based org switcher reads orgs via DB query scoped to `user.id`, not from session claims

## Security Constraints

9. Password hashing: bcrypt (cost ≥ 10) or argon2 — NEVER plain text or SHA256
10. `authorize()` in credentials provider returns `null` on failure — never throws
11. `callbackUrl` parameter must be sanitized using `sanitizeRedirectUrl()` before any redirect
12. `AUTH_SECRET` added to `src/core/env.ts` as server-only required variable
13. `emailVerified: false` by default for credentials provider (not externally verified)
14. Never log raw Error objects — extract `errorMessage: error.message`, `errorName: error.name` (SEC-10)
15. Never log passwords, tokens, or session data

## Runtime Constraints

16. **NEVER** use `export const dynamic` or `export const runtime` in any new file (cacheComponents: true bans both)
17. **ALWAYS** use `await connection()` in new route handlers (`/api/auth/[...nextauth]/route.ts`)
18. `/auth/signin/page.tsx` and `/auth/signup/page.tsx` must use `await connection()` if they read session state
19. `SessionProvider` must be a Client Component (`'use client'`)
20. Auth.js route handler: `handlers.GET` and `handlers.POST` from `auth.ts`

## Validation Constraints

21. All 1031+ unit tests must continue to pass
22. Typecheck must pass (0 errors)
23. `pnpm lint --fix` must run clean
24. `AuthJsRequestIdentitySource.test.ts` must be updated to test the real implementation (stub tests removed)
25. Unit tests for `AuthJsEdgeIdentitySource` must cover: authenticated, unauthenticated, and error cases

## Explicitly Allowed Changes

- Install `next-auth` package (pnpm add)
- Add `AUTH_SECRET` to `src/core/env.ts` server schema
- Replace stub `AuthJsRequestIdentitySource.get()` with real session read
- Add `authjs` branch to `proxy.ts` `nonClerkProxy()` function
- Add `SessionProvider` conditional in `layout.tsx`
- Add authjs branch to `WorkspaceSwitcher.tsx`
- Create new pages: `/auth/signin`, `/auth/signup` (new routes, no existing routes touched)
- Create new route: `/api/auth/[...nextauth]` (new route)
- Create `AuthJsWorkspaceSwitcher.tsx` as new UI component

## Explicitly Forbidden Changes

- Do NOT add `export const dynamic` or `export const runtime` to any file
- Do NOT import `auth.ts` from Edge-context files (proxy.ts, auth.config.ts)
- Do NOT remove or modify the Clerk infrastructure code
- Do NOT move business logic into Client Components
- Do NOT bypass `withRateLimit` or `withAuth` in the security pipeline
- Do NOT store passwords in session tokens or logs
- Do NOT create `middleware.ts` — proxy is `src/proxy.ts`
- Do NOT use `Math.random()` for tokens or secrets (SEC-06)

## Protected Invariants

- `ClerkRequestIdentitySource` must remain unchanged
- `src/proxy.ts` Clerk path must remain unchanged
- `src/app/layout.tsx` Clerk provider branch must remain unchanged
- Existing 1031+ unit tests must not be broken
- `RequestIdentitySourceData` contract shape must not change
- Security pipeline middleware chain order must not change

---

## Implementation Sequence (Recommended)

```
7.1 → Install next-auth
7.2 → auth.config.ts (Edge-safe, no credentials)
7.3 → auth.ts (Node-only, credentials provider)
7.4 → AuthJsRequestIdentitySource (replace stub)
7.5 → AuthJsEdgeIdentitySource (Edge source for proxy.ts)
7.6 → /api/auth/[...nextauth]/route.ts
7.7 → SessionProvider wrapper
7.8 → /auth/signin page
7.9 → /auth/signup page
7.10 → AuthJsWorkspaceSwitcher + WorkspaceSwitcher update
7.11 → Wire proxy.ts + layout.tsx + update env.ts
```

Steps 7.2+7.3 are tightly coupled (create together).
Steps 7.4+7.5+7.6 depend on 7.2+7.3.
Steps 7.7+7.8+7.9+7.10 can follow in parallel with 7.4-7.6.
Step 7.11 is the final wiring step.
