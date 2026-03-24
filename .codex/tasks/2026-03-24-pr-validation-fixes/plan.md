# PR Validation Fix Plan

Date: 2026-03-24
Branch: `feat/drizzle`
Scope: Address the current PR review findings before final PR preparation.

## Status

- [x] Internal API protection hardened to remove the shared demo-key path from runtime defaults and public browser examples.
- [x] E2E rate-limit bypass narrowed from a global API bypass to explicit probe routes used by the E2E/runtime matrix.
- [x] Secure action audit logging updated to redact sensitive input fields on failure.
- [x] `/api/users` clarified as a provisioning/runtime probe backed by sample data rather than a full authorization showcase.
- [x] Validation rerun after implementation.

## Objective

Fix the four identified review findings with the smallest safe blast radius:

- P1: internal API protection is fail-open by default
- P1: `E2E_ENABLED` disables rate limiting too broadly
- P2: failed secure actions log raw input
- P2: `/api/users` is a provisioning probe, not proof of route-level authorization

## Constraints

- Keep the Clerk-first production path intact.
- Preserve the current modular-monolith boundaries.
- Prefer fail-closed security behavior over convenience defaults.
- Do not expand scope into full Auth.js or Supabase implementations.
- Do not turn the `/api/users` sample route into a larger feature refactor.

## Plan

### 1. Harden internal API protection

- Remove the production-like default `demo-internal-key` behavior from the env contract or otherwise force fail-closed handling for non-test execution.
- Stop demonstrating a real internal API key from a public client component.
- Re-check internal diagnostics routes and related docs so the branch no longer normalizes a publicly guessable internal key.

### 2. Narrow E2E bypass behavior

- Restrict `E2E_ENABLED` so it cannot disable rate limiting for all API routes in production-like environments.
- Prefer explicit test-only conditions and/or route-scoped bypasses rather than a global middleware bypass.
- Preserve current E2E flows only where they are intentionally required.

### 3. Redact secure action audit payloads

- Add a redaction layer before writing failed action input to logs.
- Strip `_replayToken`, token-like fields, secrets, credentials, cookies, and similar sensitive values by default.
- Keep enough structured metadata for debugging without retaining raw user payloads.

### 4. Clarify `/api/users` semantics

- Keep `/api/users` as a node-gated provisioning/runtime probe for now.
- Update comments, docs, and PR language so it is not described as a route already enforcing full RBAC/ABAC semantics.
- Add an explicit follow-up note for future resource-level authorization if needed.

## Validation Plan

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:integration`
- Targeted follow-up checks:
- internal API guard behavior
- rate-limit middleware behavior
- secure action audit logging
- users-route provisioning behavior

## Exit Criteria

- No shipped default internal API key path remains for production-like usage.
- `E2E_ENABLED` cannot globally disable API rate limiting outside intentional test scope.
- Failed secure actions no longer log raw sensitive input.
- `/api/users` is described accurately as a provisioning/runtime gate, not a completed authorization example.

## Validation Results

- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm test` ✅
- `pnpm test:integration` ✅
