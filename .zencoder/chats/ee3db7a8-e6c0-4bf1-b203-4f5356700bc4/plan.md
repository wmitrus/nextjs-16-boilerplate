# Implementation Plan - Enterprise Security Architecture Refactoring

## Phase 14: Integration Test Consolidation (Completed)

- [x] Locate all scattered integration test files across the codebase.
- [x] Move integration tests from `src/core/logger/`, `src/shared/lib/api/`, `src/app/tests/`, `src/features/user-management/tests/`, and `src/app/api/users/` to `src/testing/integration/`.
- [x] Fix all import paths after moving test files.
- [x] Simplify tests that were testing server components incompatible with jsdom environment.
- [x] Run `pnpm test:integration` and verify all 38 tests pass.
- [x] Run `pnpm typecheck` and `pnpm lint` to ensure code quality.

## Phase 13: Final Architecture Hardening & Verification (Completed)

- [x] Extend integration tests to cover complex redirect scenarios (Onboarding, Auth).
- [x] Implement and verify Server Action Replay Protection tests.
- [x] Add Security Audit logging to `withInternalApiGuard`.
- [x] Standardize Rate Limit audit logs with `SECURITY_AUDIT` type and category.
- [x] Ensure `E2E_ENABLED` is fully mockable via `src/core/env.ts`.
- [x] Final verification of all integration tests (40+ scenarios).
- [x] Run `pnpm typecheck` and `pnpm lint` across the entire codebase.

## Phase 12: Comprehensive Security Integration Testing (Completed)

- [x] Implement middleware pipeline integration tests in `src/testing/integration/middleware.test.ts`.
- [x] Implement Server Actions integration tests in `src/testing/integration/server-actions.test.ts`.
- [x] Implement Outbound Security integration tests in `src/testing/integration/outbound.test.ts`.
- [x] Implement RSC Data Sanitization integration tests in `src/testing/integration/sanitization.test.ts`.
- [x] Verify full pipeline (Rate Limit -> Auth -> Internal Guard -> Headers).
- [x] Ensure all integration tests pass with 100% type safety and zero `any`.
- [x] Run `pnpm test:integration` and verify results.

## Phase 9: Scale-Ready Architectural Mock Refactoring (Completed)

- [x] Create global testing infrastructure in `src/testing/` (Infrastructure & Factories).
- [x] Implement co-located `.mock.ts` files for security-specific domain logic.
- [x] Migrate all security tests to the new "Shared Infrastructure + Co-located Domain" architecture.
- [x] Verify 100% type safety and zero `any` usage.
- [x] Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.

## Phase 10: Coverage Optimization & Quality Hardening (Completed)

- [x] Analyze current coverage and identify files for exclusion (mocks, factories, showcase).
- [x] Update `vitest.unit.config.ts` with refined coverage exclusions.
- [x] Implement missing tests for core logic to reach 80% coverage threshold.
- [x] Verify all tests pass with 80% coverage on all metrics.

## Phase 11: Pixel-Perfect Coverage Hardening (Completed)

- [x] Address uncovered lines in `src/core/logger/server.ts` (67-71 - Proxy logic).
- [x] Address uncovered line in `src/security/actions/secure-action.ts` (91 - Generic Error handling).
- [x] Address uncovered lines in `src/security/middleware/with-headers.ts` (22, 42 - CSP/Prod Branching).
- [x] Address uncovered line in `src/core/env.ts` (41 - Error handling).
- [x] Address uncovered line in `src/shared/components/ui/polymorphic-element.tsx` (38 - Default element fallback).
- [x] Verify final coverage meets 100% or absolute maximum practical limit.
- [x] Fix global mock synchronization issues (Clerk, Pino, Headers, Env).

## Phase 8: Comprehensive Test Refactoring & Hardening

- [x] Create `src/security/testing/` utilities to eliminate `any` and boilerplate.
- [x] Implement typed factories for `NextRequest`, `NextResponse`, and `SecurityContext`.
- [x] Centralize mocks for Clerk and Next.js internal APIs.
- [x] Refactor all security unit tests to use these utilities.
- [x] Ensure 100% type safety in tests (no `any`).
- [x] Verify all tests pass and meet performance standards.
- [x] Run `pnpm typecheck` and `pnpm lint`.

## Phase 1: Foundation & Context (Completed)

- [x] Create `SecurityContext` types and `getSecurityContext` helper.
- [x] Implement `authorization.ts` with `admin`, `user`, `guest` roles.
- [x] Add necessary security environment variables to `src/core/env.ts`.

## Phase 2: Middleware Pipeline (Completed)

- [x] Implement `route-classification.ts` for classifying requests.
- [x] Implement `with-headers.ts` for security headers and CSP.
- [x] Implement `with-internal-api-guard.ts` for internal route protection.
- [x] Implement `with-auth.ts` integrating Clerk and Role-based redirects.
- [x] Implement `with-rate-limit.ts` (porting existing logic from proxy.ts).
- [x] Implement `with-security.ts` as the main pipeline entry point.
- [x] Update `src/proxy.ts` to use the new security pipeline.

## Phase 3: Secure Server Actions (Completed)

- [x] Implement `createSecureAction` wrapper in `src/security/actions/secure-action.ts`.
- [x] Implement replay protection logic (nonce/timestamp validation).
- [x] Add mutation logging utility.

## Phase 4: Advanced Protection & Observability (Completed)

- [x] Implement `secure-fetch.ts` for SSRF protection.
- [x] Implement `data-sanitizer.ts` for RSC response cleaning.
- [x] Add security audit logging to the logging core.

## Phase 5: Verification & Hardening (Completed)

- [x] Run `pnpm typecheck` and `pnpm lint`.
- [x] Add unit tests for critical security components (guards, actions).
- [x] Perform manual verification of security headers.
- [x] Create comprehensive security documentation in `docs/features/20 - Enterprise Security Architecture.md`.

## Phase 6: Security Showcase (Completed)

- [x] Implement `src/features/security-showcase/` with:
  - [x] `SecurityShowcasePage`: Demonstrates RBAC and Security Context.
  - [x] `ProfileExample`: Demonstrates RSC Data Sanitization.
  - [x] `SettingsAction`: Demonstrates Secure Server Actions + Auditing.
  - [x] `ExternalFetch`: Demonstrates SSRF Protection.
  - [x] `InternalApiTest`: Demonstrates Internal API Guard.
- [x] Add `/security-showcase` route to the application.
- [x] Add link to Security Showcase in the `Header` navigation.
- [x] Verify all examples pass typecheck and lint.

## Phase 7: Dynamic Security Configuration (Completed)

- [x] Add CSP allowlist variables to `src/core/env.ts`.
- [x] Update `with-headers.ts` to use environment variables for CSP.
- [x] Update `secure-fetch.ts` to use environment variable for outbound host allowlist.
- [x] Update `.env.example` and `docs/features/ENV-requirements.md` with new security variables.
- [x] Implement environment-aware CSP and SSRF policies (Prod vs Preview/Dev).
- [x] Fix Internal API Guard authentication bypass (Allowing internal keys without Clerk session).
- [x] Harden `/api/logs` ingest with public route classification and existing secret verification.
