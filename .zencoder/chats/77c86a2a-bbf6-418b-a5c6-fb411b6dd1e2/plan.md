# Implementation Plan - Enterprise Security Architecture

## Phase 1: Foundation & Context

- [x] Create `SecurityContext` types and `getSecurityContext` helper.
- [x] Implement `authorization.ts` with `admin`, `user`, `guest` roles.
- [x] Add necessary security environment variables to `src/core/env.ts`.

## Phase 2: Middleware Pipeline

- [x] Implement `route-classification.ts` for classifying requests.
- [x] Implement `with-headers.ts` for security headers and CSP.
- [x] Implement `with-internal-api-guard.ts` for internal route protection.
- [x] Implement `with-auth.ts` integrating Clerk and Role-based redirects.
- [x] Implement `with-rate-limit.ts` (porting existing logic from proxy.ts).
- [x] Implement `with-security.ts` as the main pipeline entry point.
- [x] Update `src/proxy.ts` to use the new security pipeline.

## Phase 3: Secure Server Actions

- [x] Implement `createSecureAction` wrapper in `src/security/actions/secure-action.ts`.
- [x] Implement replay protection logic (nonce/timestamp validation).
- [x] Add mutation logging utility.

## Phase 4: Advanced Protection & Observability

- [x] Implement `secure-fetch.ts` for SSRF protection.
- [x] Implement `data-sanitizer.ts` for RSC response cleaning.
- [x] Add security audit logging to the logging core.

## Phase 5: Verification & Hardening

- [x] Run `pnpm typecheck` and `pnpm lint`.
- [x] Add unit tests for critical security components (guards, actions).
- [x] Perform manual verification of security headers.
- [x] Create comprehensive security documentation in `docs/features/20 - Enterprise Security Architecture.md`.

## Phase 6: Security Showcase

- [x] Implement `src/features/security-showcase/` with:
  - [x] `SecurityShowcasePage`: Demonstrates RBAC and Security Context.
  - [x] `ProfileExample`: Demonstrates RSC Data Sanitization.
  - [x] `SettingsAction`: Demonstrates Secure Server Actions + Auditing.
  - [x] `ExternalFetch`: Demonstrates SSRF Protection.
  - [x] `InternalApiTest`: Demonstrates Internal API Guard.
- [x] Add `/security-showcase` route to the application.
- [x] Verify all examples pass typecheck and lint.
