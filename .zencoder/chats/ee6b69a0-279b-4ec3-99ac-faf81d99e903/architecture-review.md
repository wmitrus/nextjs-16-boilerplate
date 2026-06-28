# Architecture Review — Phase 7: AuthJS Adapter

**Agent**: 01 - Architecture Guard
**Plan step**: Architecture Design
**Date**: 2026-04-20

---

## Architectural Fit Assessment

Phase 7 fits cleanly within the existing auth module boundary. The provider-switching pattern is already established:

- `src/modules/auth/index.ts` has a `buildIdentitySource()` switch with `'authjs'` case (currently returns stub)
- `src/proxy.ts` already has the `nonClerkProxy` path gated behind `AUTH_PROVIDER !== 'clerk'`
- Layout already conditionally renders `ClerkProvider` behind `isClerkProvider` flag

The design follows the established pattern: each auth provider implements `RequestIdentitySource` and optionally an Edge-safe variant for proxy.ts.

---

## Affected Layers and Modules

| Layer                                          | Files                                                                                        | Change Type                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/modules/auth/infrastructure/authjs/`      | `auth.config.ts`, `auth.ts`, `AuthJsRequestIdentitySource.ts`, `AuthJsEdgeIdentitySource.ts` | New files + stub replacement                                             |
| `src/app/api/auth/[...nextauth]/`              | `route.ts`                                                                                   | New route handler                                                        |
| `src/modules/auth/ui/authjs/`                  | `SessionProvider.tsx`, `AuthJsWorkspaceSwitcher.tsx`                                         | New UI components                                                        |
| `src/app/auth/signin/`, `src/app/auth/signup/` | `page.tsx`                                                                                   | New pages                                                                |
| `src/proxy.ts`                                 | Existing file                                                                                | Wire `AuthJsEdgeIdentitySource`                                          |
| `src/app/layout.tsx`                           | Existing file                                                                                | Add SessionProvider wrapper                                              |
| `src/modules/auth/ui/WorkspaceSwitcher.tsx`    | Existing file                                                                                | Add authjs branch                                                        |
| `src/modules/auth/index.ts`                    | Existing file                                                                                | No change needed (already imports stub — stub will be replaced in-place) |

---

## Dependency Direction Analysis

**Allowed**:

- `authjs/auth.config.ts` → `next-auth` (third-party)
- `authjs/auth.ts` → `authjs/auth.config.ts` (intra-module)
- `AuthJsRequestIdentitySource` → `authjs/auth.ts`, `@/core/contracts/identity` (module → core contracts ✅)
- `AuthJsEdgeIdentitySource` → `authjs/auth.config.ts`, `@/core/contracts/identity` (module → core contracts ✅)
- Route handler `/api/auth/[...nextauth]` → `authjs/auth.ts` (app → module infrastructure ✅)
- `SessionProvider` wrapper → `next-auth/react` (UI → library ✅)
- `WorkspaceSwitcher` → `AuthJsWorkspaceSwitcher` (intra-module UI ✅)

**Forbidden** (must not occur):

- `authjs/` → `clerk/` — no cross-provider dependency
- `authjs/auth.ts` in Edge context — Node-only file must never reach proxy.ts
- Sign-in/sign-up pages → `@clerk/nextjs` — must stay provider-agnostic

---

## Required New Contracts or Services

No new core contracts required. The existing `RequestIdentitySource` interface is sufficient. Auth.js-specific types remain local to the `authjs/` directory.

One new abstraction is acceptable: `AuthJsEdgeIdentitySource` is a separate class from `AuthJsRequestIdentitySource` because Edge vs Node are different runtimes.

---

## Boundary Risks

| Risk                                                                    | Severity   | Mitigation                                                                          |
| ----------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `auth.ts` (Node) accidentally imported in Edge path                     | **HIGH**   | Only import `auth.config.ts` in `AuthJsEdgeIdentitySource` and `proxy.ts`           |
| `bcrypt` or `argon2` used in Edge bundle                                | **HIGH**   | Credentials validation must be in `auth.ts` (Node-only) — never in `auth.config.ts` |
| next-auth session shape mismatch with `RequestIdentitySourceData`       | **MEDIUM** | Defensively extract fields with null-safe accessors                                 |
| `cacheComponents: true` route config violation                          | **HIGH**   | No `export const runtime/dynamic` anywhere in new route handlers or pages           |
| `WorkspaceSwitcher` conditional rendering creates React Compiler issues | **LOW**    | Keep Clerk branch intact; add provider check using env var passed via server prop   |

---

## Provider Isolation Assessment

**Verdict: CLEAN** — AuthJS provider code is fully isolated in `src/modules/auth/infrastructure/authjs/`. The only cross-cutting change is in:

1. `proxy.ts` — adding identity source injection for authjs path
2. `layout.tsx` — adding conditional `SessionProvider`
3. `WorkspaceSwitcher.tsx` — adding authjs branch

All three have existing provider-conditional patterns and the changes are additive.

---

## Architectural Constraints

1. `auth.config.ts` MUST be Edge-safe (no Node APIs, no `bcrypt`, no DB calls)
2. `auth.ts` extends `auth.config.ts` with Node-only additions
3. `AuthJsEdgeIdentitySource` MUST only import from `auth.config.ts`, never `auth.ts`
4. Route handler must use `await connection()` for dynamic rendering (no `export const dynamic`)
5. Sign-in and sign-up pages must use `await connection()` if they use server-side session checks
6. `SessionProvider` must be a Client Component (`'use client'`)
7. DB-based organization switcher must read from DB via server action or route handler — not from Auth.js session claims alone

---

## Status: APPROVED

Architecture is sound. Phase 7 can proceed to implementation.
