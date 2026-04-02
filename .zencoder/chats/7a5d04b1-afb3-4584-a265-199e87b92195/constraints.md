# Constraints Summary

## Task

Security remediation of the feature-flags system (case `3344a061`). Fix 4 CRITICAL/MAJOR security findings before the feature can be considered production-secure.

## Scope

- `GrowthBookFeatureFlagService.ts` — CRIT-01 fix (per-request context)
- `src/security/middleware/route-policy.ts` — CRIT-02 fix (add `/feature-flags-demo` to public routes)
- `scripts/flags/export.ts` — MAJ-01 fix (path confinement for `--out`)
- `scripts/flags/import.ts` — MAJ-02 fix (path confinement for `--file`)
- `src/modules/feature-flags/factory.ts` — MAJ-03 fix (GrowthBook API host allowlist)
- `src/modules/feature-flags/infrastructure/resilient/ResilientFeatureFlagService.ts` — MAJ-04 fix (error sanitization)

---

## Architecture Constraints

- Module boundaries must not change — all fixes are contained within existing files/modules.
- `FeatureFlagService` contract must not change — callers are unaffected.
- Provider isolation must be preserved — no GrowthBook types in `src/core/contracts/`.
- The factory pattern remains the composition seam — host validation belongs in `factory.ts`.
- `scripts/flags/utils.ts` is the correct home for the shared path-confinement guard function.

## Security and Auth Constraints

- GrowthBook instance attributes **must not be shared across requests** — per-request context is mandatory.
- Script file paths derived from CLI args **must be confined** using `path.resolve()` + base-directory prefix check at point of use.
- `GROWTHBOOK_API_HOST` **must be validated** against a hostname allowlist (allow `*.growthbook.io` + `https:` protocol) at point of consumption.
- Error objects logged by `ResilientFeatureFlagService` must be sanitized to `errorMessage` + `errorName` only.
- `/feature-flags-demo` **must be added** to `PUBLIC_ROUTE_PREFIXES` (the page uses a synthetic hardcoded context — no sensitive data).

## Runtime Constraints

- `connection()` must remain as the first call in `FeatureFlagsDemoContent` RSC — do not remove it.
- Flag evaluation remains server-side only — no client component evaluation.
- GrowthBook feature definition fetch may be cached at module level (safe); mutable attribute state may not.
- All feature-flag env vars remain server-only (not `NEXT_PUBLIC_*`).

## Validation Constraints

- `pnpm typecheck` must pass after all changes.
- `pnpm lint --fix` must pass (not `pnpm lint`).
- `pnpm test` must pass — no existing tests may be broken by fixes.
- After CRIT-02 fix, the E2E spec for `/feature-flags-demo` must be validated against a real server.

## Explicitly Allowed Changes

- Adding `assertPathWithinBase()` to `scripts/flags/utils.ts` and calling it in `export.ts` and `import.ts`.
- Modifying `GrowthBookFeatureFlagService` internals without changing its constructor signature or contract.
- Adding `/feature-flags-demo` to `PUBLIC_ROUTE_PREFIXES` array in `route-policy.ts`.
- Replacing `error` with sanitized error fields in `ResilientFeatureFlagService` log payload.
- Adding `assertSafeGrowthBookApiHost()` to `factory.ts` before instantiating `GrowthBookFeatureFlagService`.

## Explicitly Forbidden Changes

- Do NOT change `FeatureFlagService` contract signature.
- Do NOT move feature-flag code out of `src/modules/feature-flags/`.
- Do NOT add GrowthBook types to `src/core/contracts/`.
- Do NOT remove `connection()` from the demo page RSC.
- Do NOT make feature-flag evaluation happen in client components.
- Do NOT widen `PUBLIC_ROUTE_PREFIXES` beyond the specific addition of `/feature-flags-demo`.
- Do NOT use `console.warn` / `console.error` in application code — use the structured logger.

## Protected Invariants

- `FEATURE_FLAGS.SERVICE` DI token registration in bootstrap must remain.
- `ResilientFeatureFlagService` wrapping behavior (fail-safe → `false`) must not change.
- `connection()` call before `getAppContainer()` in the demo page must be preserved.
- Schema: `tenant_id` remains `text` type with `unique().nullsNotDistinct()` constraint.

## Open Questions or Blocks

1. **GrowthBook per-request init cost**: If GrowthBook's `init()` is called per-request, there is a cold-start latency penalty. The team must decide whether to cache only the feature definitions payload (a `fetch` result) and construct a new `GrowthBook` instance with the cached payload per request, or whether to accept the per-request network cost (acceptable if GrowthBook SDK has a TTL-based local cache).
2. **GROWTHBOOK_API_HOST allowlist scope**: Should the allowlist permit custom self-hosted GrowthBook instances (any hostname)? If yes, the allowlist check should only validate `https:` protocol. If no, restrict to `*.growthbook.io`. This is a product decision.
