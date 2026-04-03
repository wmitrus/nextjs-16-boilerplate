# 03 - Next.js Runtime - Summary

## Task Context

- Task ID: d2e3f2ac-67dc-40c7-ad5e-26d04006910e
- Task Objective: Runtime placement assessment for GrowthBook client cache and flag evaluation
- Current Run Scope: Module-level state safety, request isolation, Node vs Edge runtime
- Status: COMPLETED
- Last Updated: 2026-04-02
- Related Control Artifacts: `incident-intake.md`, `02 - Security & Auth - Summary.md`

---

## Scope Handled

- runtime entrypoints reviewed: `GrowthBookFeatureFlagService`, `factory.ts`
- App Router surfaces reviewed: Feature flag evaluation called from server components / route handlers via DI container
- runtime questions in scope: Module-level cache persistence, request isolation, Edge runtime compatibility

---

## Inputs Reviewed

- code paths reviewed:
  - `src/modules/feature-flags/infrastructure/growthbook/GrowthBookFeatureFlagService.ts`
  - `src/modules/feature-flags/factory.ts`
  - `src/core/contracts/feature-flags.ts`
- earlier task artifacts reviewed: `incident-intake.md`, `02 - Security & Auth - Summary.md`

---

## Actions Performed

- server/client boundary review performed: Confirmed — `GrowthBookFeatureFlagService` is server-only; no client bundle exposure
- route handler / server action review performed: Flag evaluation is invoked server-side via `FeatureFlagService` contract; not directly called from route handlers
- cache / runtime review performed: Module-level `clientCache` assessed for cross-request safety

---

## Current-State Findings

### CONFIRMED SAFE: Module-Level `clientCache` in Node.js Runtime

The `clientCache: Map<string, ClientEntry>` at module scope in `GrowthBookFeatureFlagService.ts` is intentionally persistent across requests. This is SEC-09-compliant: feature definitions are cached, per-request context (user ID, tenant ID) is passed at evaluation time via `client.isOn(flag, { attributes: {...} })`. No user data is stored in the cache.

In Next.js Node.js runtime (which this module uses via DI), module-level state persists across requests within the same process lifecycle. This is the correct pattern for SDK clients that initialize with feature definitions asynchronously.

### CONFIRMED RISK: Cache Key Does Not Include `apiHost`

The cache key `clientKey` without `apiHost` could cause incorrect backend selection if two `GrowthBookFeatureFlagService` instances are constructed with the same `clientKey` but different `apiHost` values. In the current codebase, the factory constructs exactly one service instance per process startup (singleton via DI), so this is latent risk — not currently triggered.

### INFORMATIONAL: Edge Runtime Incompatibility

`@growthbook/growthbook` uses Node.js-specific APIs (streaming, HTTP/2). The `GrowthBookFeatureFlagService` is not suitable for the Edge runtime. This is not a new finding — the service is registered in the DI container that targets Node.js runtime. No action required for this incident.

---

## Runtime Boundary Assessment

- server vs client placement: `GrowthBookFeatureFlagService` is server-only. The `FeatureFlagService` contract is resolved via DI; only boolean results reach client components.
- edge vs node placement: Node.js runtime only. Correct.
- route handler / page / layout responsibilities: Flag evaluation is consumed via DI, not invoked directly from layouts or route handlers. Correct abstraction.
- proxy responsibilities: `src/proxy.ts` does not interact with feature flags.

---

## Caching And Revalidation Notes

- cache-sensitive observations: Module-level `clientCache` caches the GrowthBook SDK client (feature definitions), not per-user data. Safe for multi-request sharing within a process.
- revalidation observations: `client.refreshFeatures()` is called on every `isEnabled()` invocation — this is correct for keeping flags fresh; no caching of individual flag evaluations occurs.
- request-time vs build-time notes: Feature flag evaluation is request-time only. No build-time static flag evaluation via GrowthBook.

---

## Runtime Decisions / Constraints

- approved runtime constraints:
  - Keep `clientCache` at module scope (SEC-09 compliance)
  - Cache entries hold only SDK client + ready promise; never user or tenant data
  - Fix: include `apiHost` in the cache key string
- rejected directions:
  - Do not move to per-request client instantiation (defeats SDK initialization cost savings and streaming)
  - Do not use Edge runtime for this adapter

---

## Open Questions / Blockers

- unresolved questions: None for runtime scope
- blockers: None

---

## Handoff Notes

- what the next agent should rely on: GrowthBook cache fix is a one-line cache key change in `GrowthBookFeatureFlagService.ts`; no runtime architecture changes needed
- what should not be re-decided without new evidence: Module-level cache is correct for Node.js runtime; do not relocate to request scope
- recommended next specialist or step: Architecture Guard for FlagsFile format change; then Constraints + Implementation

---

## Update Log

### Update Entry — Initial Runtime Review

- Date: 2026-04-02
- Trigger: Incident workflow step 3
- Summary of change: Confirmed module-level cache is runtime-safe; flagged cache key as the only fix needed
- Sections refreshed: All
