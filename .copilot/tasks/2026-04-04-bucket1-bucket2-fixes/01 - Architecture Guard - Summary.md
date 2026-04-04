# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-04-04-bucket1-bucket2-fixes`
- Task Objective: Resolve Phase 4 block — determine correct design for `RequestScopedContext.featureFlags` population
- Current Run Scope: Phase 4 contract design decision only
- Status: COMPLETED — decision made, unblocks Implementation Agent
- Last Updated: 2026-04-04
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- modules / layers reviewed: `src/core/contracts/feature-flags.ts`, `src/core/contracts/authorization.ts`, `src/security/core/request-scoped-context.ts`, `src/security/middleware/with-auth.ts`, `src/security/actions/secure-action.ts`, `src/modules/feature-flags/` (all adapters), `src/app/feature-flags-demo/page.tsx`
- change surface reviewed: `FeatureFlagService` contract, `RequestScopedContext.featureFlags` field, all five flag service adapters, both auth enforcement call sites
- architecture questions in scope: Should `featureFlags` be populated at auth layer? Which of three options is architecturally correct?

## Inputs Reviewed

- code paths reviewed:
  - `src/core/contracts/feature-flags.ts` — `isEnabled(flag, AuthorizationContext): Promise<boolean>` — per-flag, no bulk method
  - `src/core/contracts/authorization.ts:38–43` — `TenantAttributes.features` already covers ABAC entitlements; comment explicitly says "ABAC conditions on policies, NOT middleware checks"
  - `src/security/core/request-scoped-context.ts` — `featureFlags` declared, defaults `{}`, never populated
  - `src/security/middleware/with-auth.ts:212` — builds `requestScope` without flags
  - `src/security/actions/secure-action.ts:145` — same via `createRequestScopedContextFromSecurityContext()`
  - `src/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagService.ts` — keyed lookup, no enumerate-all query
  - `src/modules/feature-flags/infrastructure/resilient/ResilientFeatureFlagService.ts` — per-call fail-safe wrapper
  - `src/app/feature-flags-demo/page.tsx:53–58` — confirmed point-of-use pattern: named flags resolved via `Promise.all`
  - `grep -rn "\.featureFlags"` — zero production consumers of the field
- docs / ADRs / prompts reviewed: `docs/prompts/03 - Per-Tenant Feature Flags Prompt.md` (step 3: "inject flags into request scope")
- earlier task artifacts reviewed: `04 - Implementation Agent - Summary.md` (Phase 4 block description)

## Actions Performed

- repository inspection performed: Yes — all adapters, both enforcement call sites, all contract files, production usage
- boundary checks performed: Yes — confirmed flag evaluation is point-of-use in production; auth layer does not and should not know which flags are relevant per route
- dependency / DI review performed: Yes — `FEATURE_FLAGS.SERVICE` token exists, resolves correctly in DI; the problem is not DI, it is design intent
- docs-vs-code checks performed: Yes — Prompt 03 step 3 ("inject flags into request scope") was ambiguous; code shows the field exists but is intentionally empty; demo page shows the correct model

## Current-State Findings

- Confirmed:
  - `FeatureFlagService` has only `isEnabled(flag, context)` — no bulk method, by design
  - `RequestScopedContext.featureFlags` is declared but always `{}` — no production code reads it
  - The established pattern is point-of-use evaluation at the RSC/action level (demo page)
  - `TenantAttributes.features` already provides the ABAC-native entitlement channel for policy conditions
  - `authorization.ts:38` comment explicitly assigns feature flags to ABAC conditions, not middleware checks
- Risks:
  - The undocumented field misleads future implementors into attempting auth-layer bulk population
  - Without this assessment on record, a future agent could attempt Option 1 (contract change) without justification
- Drift:
  - Prompt 03 step 3 said "inject flags into request scope" — this was the source of the Implementation Agent's assumption. The code and contract design show the intent is opt-in per-callsite, not automatic bulk injection at auth time.

## Boundary And Dependency Assessment

- module ownership assessment: Correct. `FeatureFlagService` lives in `src/modules/feature-flags/` and is accessed via `FEATURE_FLAGS.SERVICE` token from DI. No boundary violation.
- dependency direction assessment: Correct. Demo page uses `getAppContainer().createChild()` → DI resolution → service call. Auth layer does not import flag module directly.
- DI / composition assessment: Sound. The container registration in `src/core/runtime/bootstrap.ts` is correct. The problem is not composition — it is design intent for the `featureFlags` field.
- cross-module coupling assessment: No coupling problem. Point-of-use means each feature/page resolves the flags it needs. This preserves isolation.

## Architectural Decisions / Constraints

- approved architectural constraints:
  - **`FeatureFlagService.isEnabled()` remains the sole contract method. No `getAll()` method to be added.**
  - **`RequestScopedContext.featureFlags` is an opt-in field.** It is NOT populated by the auth layer. Callers who need pre-fetched flags for a specific set of known flags may populate it explicitly before passing context downstream.
  - **Point-of-use is the correct and established pattern.** RSC pages and server actions resolve named flags via `flagService.isEnabled()` with a full context at the point they are needed.
  - **`TenantAttributes.features` is the ABAC-native channel** for entitlement-as-policy-condition. Do not duplicate this via `featureFlags` pre-loading.

- rejected directions:
  - **REJECTED: New `getAll(tenantId)` contract method.** No justification, broad blast radius across all adapters, GrowthBook has no direct equivalent, no current consumer.
  - **REJECTED: Known-flags registry.** New concept with no existing infrastructure, highest blast radius, disproportionate to the problem.
  - **REJECTED: Auto-population at auth layer** (`with-auth.ts` / `secure-action.ts`). Auth layer is a generic cross-cutting concern. It cannot know which flags are relevant for any given route or action. This would be speculative pre-loading for unknown consumers.

- follow-up architectural guardrails:
  - If a future feature needs pre-fetched flags passed to child RSC components, the correct pattern is: resolve named flags in the RSC page, build the map explicitly, pass to `createRequestScopedContext({ featureFlags: { 'flag-a': true } })` at the component level — not at auth middleware.
  - If the ABAC policy engine needs to gate on a feature flag, use `TenantAttributes.features`, not `RequestScopedContext.featureFlags`.

## Artifact Synchronization

- `plan.md` updates: Step 4 to be updated from "BLOCKED" to "COMPLETED — JSDoc only"
- `intake.md` updates: Phase 4 acceptance criteria to be updated
- `implementation-plan.md` updates: Phase 4 to reflect JSDoc-only deliverable
- specialist artifact updates: This file; `04 - Implementation Agent - Summary.md` to be updated by Implementation Agent after JSDoc is added

## Open Questions / Blockers

- unresolved questions: None
- blockers: None — Phase 4 is unblocked
- evidence still needed: None

## Handoff Notes

- what the next agent should rely on:
  - The `featureFlags` field is opt-in. Default empty is correct by design.
  - Implementation Agent should add a clarifying JSDoc to the field in `request-scoped-context.ts` — that is the only deliverable for Phase 4.
  - No logic change. No new contract method. No adapter changes.
- what should not be re-decided without new evidence:
  - Do not add `getAll()` to `FeatureFlagService` without a concrete consumer requirement and Architecture Guard sign-off.
  - Do not auto-populate `featureFlags` at auth layer without Architecture Guard sign-off.
- recommended next specialist or step: `04 - Implementation Agent` — add JSDoc to `featureFlags` field in `request-scoped-context.ts`, then run `pnpm typecheck` to confirm, then proceed to `05 - Validation Strategy` sign-off.

## Update Log

### Update Entry

- Date: 2026-04-04
- Trigger: Implementation Agent Phase 4 block escalation
- Summary of change: Full architectural review performed; Option 3 (point-of-use only) approved; Options 1 and 2 rejected with rationale
- Sections refreshed: All (initial creation)
