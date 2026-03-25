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

## Follow-Up Phase: Logging Topology

Date: 2026-03-25
Goal: Make security and browser logs consistently visible in local file logs and Logflare while preserving full console visibility in development.

### Current Findings

- Browser logs already reach `POST /api/logs` and are written to `logs/server.log` as `type: "browser-ingest"`.
- Security middleware logs are visible in local console output, but they are not taking the same persisted sink path as server logs.
- The current edge logger relies on Pino `browser.transmit`, which is a browser-only model and is not a dependable edge/server transport path.
- The development experience must remain `console + ingest`, not `console or ingest`.

### Constraints

- Keep all existing console output in development for server, edge/security, and browser-originated logs.
- Preserve the current server logger as the owner of file and Logflare sinks.
- Do not ship Logflare credentials to the browser or edge runtimes.
- Keep the blast radius focused to the logging pipeline; avoid unrelated auth or middleware refactors.

### Task List

- [x] Refactor the edge logger to an explicit edge-safe adapter that logs locally to console/stdout and separately forwards structured events to `/api/logs`.
- [x] Extract a shared ingest helper so browser and edge forwarding use one payload contract and one transport policy.
- [x] Keep direct file and Logflare writes owned by the server logger only; `/api/logs` should remain the canonical promotion point for non-Node runtimes.
- [x] Update ingest forwarding only where needed to preserve runtime classification (`browser` vs `edge`) and prevent recursive `/api/logs` re-ingest loops.
- [x] Add or update focused tests for the edge logger path, shared ingest helper behavior, and `/api/logs` classification.
- [ ] Revalidate that browser logs still appear in browser devtools console and continue landing in `logs/server.log`.
- [x] Revalidate that security middleware logs still appear in dev console and now also land in `logs/server.log`.
- [x] Capture the remaining Logflare verification gap explicitly while local sink parity is confirmed.
- [x] Update logging documentation so the documented routing matches the actual runtime behavior.

### Validation Checklist

- [ ] Trigger a unique browser log message and confirm it appears in browser devtools, `logs/server.log`, and Logflare.
- [ ] Trigger a unique middleware/security log and confirm it appears in terminal console, `logs/server.log`, and Logflare.
- [ ] Confirm ordinary server logs still appear in terminal console, `logs/server.log`, and Logflare.
- [x] Run focused logger tests after the refactor.

### Validation Notes

- Focused logger tests passed:
  - `src/core/logger/ingest-transport.test.ts`
  - `src/core/logger/browser-utils.test.ts`
  - `src/core/logger/edge-utils.test.ts`
  - `src/core/logger/edge.test.ts`
  - `src/app/api/logs/route.test.ts`
- `pnpm typecheck` ✅
- `pnpm exec vitest run --config vitest.integration.config.ts src/testing/integration/logger.integration.test.ts --coverage.enabled=false` ✅
- Fresh runtime smoke checks on 2026-03-25:
  - Browser-ingest probe `browser-ingest-smoke-1774398258744` was persisted to `logs/server.log`.
  - Security middleware probe `/logging-smoke-1774398368431` appeared in the dev console and was persisted to `logs/server.log`.
  - Recursive `/api/logs` edge re-ingest was prevented by skipping forwarding when the edge event path is `/api/logs`.
- Direct browser-devtools verification remains deferred in this environment because browser automation was unavailable locally.
- Direct Logflare UI verification remains deferred in this environment. With the new topology, browser and edge events now traverse the same server logger sink path as server logs, so any remaining absence in Logflare is likely a sink-delivery issue or a Logflare source/query visibility issue rather than a browser/edge routing gap.

### Exit Criteria For This Phase

- Security middleware logs are visible in dev console and persisted through the server sink path.
- Browser logs remain visible in the browser console and persisted through the server sink path.
- File logging and Logflare shipping are owned by one canonical server-side sink pipeline.
- The documentation no longer claims behavior that the implementation does not actually provide.
