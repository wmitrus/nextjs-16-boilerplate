# Task Brief — Feature Flags Use-Case

## Title

Feature Flags — First Production Provider & Contract Stabilisation

---

## Objective

Determine the correct long-term provider strategy (OpenFeature mandatory vs. local adapter pattern) for the feature-flag module, then implement the first production-ready adapter, wire it into the DI container, define consumption patterns, and resolve existing docs-vs-code drift.

---

## Problem Statement

The `src/modules/feature-flags/` module has a clean contract and two infrastructure stubs today:

- `FeatureFlagService` (`src/core/contracts/feature-flags.ts`) exposes only `isEnabled(flag, context): Promise<boolean>`.
- `InMemoryFeatureFlagService` works; used for tests and local fallback.
- `OpenFeatureFeatureFlagService` exists but throws `not implemented` — it is not usable.
- `FEATURE_FLAGS.SERVICE` DI token is defined in `src/core/contracts/index.ts`.
- No real provider is registered in the DI composition root.

Additionally there is documented drift:

- `docs/tanstack-migration/14-feature-flags.md` describes `FeatureFlagProvider` (a different name), `getVariant()` (not in the contract), and `FeatureFlagContext` (not in the contract — the real code uses `AuthorizationContext`). That doc is a migration artefact from a TanStack boilerplate, not the live Next.js contract.

The operator believes the local adapter/contract pattern is correct and OpenFeature should not be mandatory. An Architecture Guard decision is required before implementation begins.

---

## Scope

- Architecture Guard decision: local adapter pattern vs. OpenFeature mandatory dependency.
- Stabilise the `FeatureFlagService` contract (decide whether `getVariant` or a `FeatureFlagContext` shape is needed now or explicitly deferred).
- Implement first real production provider adapter (GrowthBook direct SDK, or database-backed, TBD after guard decision).
- Wire provider into the DI composition root.
- Define server-side consumption pattern for App Router route handlers and server actions.
- Resolve or remove the non-functional `OpenFeatureFeatureFlagService` stub.
- Fix docs drift in `docs/tanstack-migration/14-feature-flags.md` or explicitly mark it as deprecated.
- Add or extend unit tests.

---

## Out Of Scope

- Client-side flag SDK integration (React context, client components).
- Flag management UI or admin dashboard.
- Flag cleanup / lifecycle tracking tooling.
- A/B testing or experiment tracking (variants, exposure logging).
- OpenFeature full implementation unless the Architecture Guard approves it as the primary pattern.
- Multi-provider runtime switching.
- Database schema for DB-backed flags (may be introduced later, separately).
- Changes to `src/modules/authorization/` or `src/modules/auth/`.

---

## Requirements

1. The app must depend on `FeatureFlagService` only — never on vendor SDK types directly.
2. The DI token `FEATURE_FLAGS.SERVICE` must be the only wiring seam.
3. At least one production-ready adapter must be implemented and registered.
4. `InMemoryFeatureFlagService` stays as the test/local-dev fallback.
5. `OpenFeatureFeatureFlagService` must either be removed (if not planned) or properly implemented (if approved by Architecture Guard).
6. Flags must be evaluated server-side; the result may be passed to the client via loader data or server props.
7. Server-side evaluation must propagate `AuthorizationContext` (which carries `userId`, `orgId`, `role`) — no separate `FeatureFlagContext` shape unless the guard approves it.
8. Contract expansion (`getVariant`, variants) must be explicitly deferred or approved — not silently added.
9. All gates must pass: `pnpm typecheck`, `pnpm lint`, `pnpm test`, dependency boundary checks.
10. Docs drift in `14-feature-flags.md` must be addressed (corrected or deprecated).

---

## Scenarios / Use Cases

**SC-01** Server action / route handler checks a boolean flag before proceeding.

**SC-02** Flag is off for all users globally (safe default).

**SC-03** Flag is on for a specific org/tenant and off for others (tenant-scoped evaluation).

**SC-04** Test uses `InMemoryFeatureFlagService` to stub flags without external dependency.

**SC-05** A second provider adapter is added in future without changing app-layer consumption code.

---

## Acceptance Criteria

- `FeatureFlagService` contract is stable and intentionally minimal (or explicitly expanded with guard approval).
- At least one real provider adapter implements `FeatureFlagService` and is registered in the DI container.
- `InMemoryFeatureFlagService` remains the test/local-dev fallback.
- `OpenFeatureFeatureFlagService` stub is either removed or fully implemented — no throwing stubs in production.
- App-layer code depends on `FeatureFlagService`; zero direct imports of vendor SDK types in feature or security modules.
- Server-side consumption pattern is documented in code (at minimum a helper or example usage).
- `pnpm typecheck` passes.
- `pnpm lint --fix` passes with no residual errors.
- `pnpm test` passes (unit tests for the new adapter and the contract).
- Dependency boundary checks pass (`pnpm skott:check:only`, `pnpm madge`, `pnpm depcheck`).
- Docs drift in `14-feature-flags.md` resolved.

---

## Verification Sources

- `src/core/contracts/feature-flags.ts` — live contract (source of truth).
- `src/core/contracts/index.ts` — DI token (source of truth).
- `src/modules/feature-flags/` — infrastructure adapters (source of truth).
- `docs/prompts/03 - Per-Tenant Feature Flags Prompt.md` — constraint and acceptance reference.
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — security coding rules.
- `docs/architecture/13 - Development Commitment & Extension Contract.md` — extension contract.
- `docs/architecture/14 - Implementation Guardrails & AI Prompt Contract.md` — guardrails.

---

## Affected Areas

| Area                                                       | Status                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `src/core/contracts/feature-flags.ts`                      | Possibly extended (guard decision needed)                       |
| `src/core/contracts/index.ts`                              | DI token exists; may need `PROVIDER` vs `SERVICE` clarification |
| `src/modules/feature-flags/index.ts`                       | New adapter export                                              |
| `src/modules/feature-flags/infrastructure/openfeature/`    | Remove or implement                                             |
| `src/modules/feature-flags/infrastructure/memory/`         | Retain as-is                                                    |
| `src/modules/feature-flags/infrastructure/<new-provider>/` | New file                                                        |
| Composition root (DI bootstrap)                            | Wire new provider                                               |
| `docs/tanstack-migration/14-feature-flags.md`              | Fix or mark deprecated                                          |

---

## Constraints

- Module boundaries from `docs/architecture/01 - Global Dependency Rules.md` must not be violated.
- No feature-flag policy logic in `src/shared/`.
- No provider SDK types leaking into domain or app layer.
- `AuthorizationContext` is the existing flag evaluation context — do not introduce a parallel context type without guard approval.
- Flag evaluation is server-side only for security-sensitive gates.
- No changes to authorization or auth contracts.
- The composition root may be in `src/core/` or wherever the DI bootstrap lives — verify location before writing.

---

## Execution Control

`manual-handoff` — **stop after Architecture Guard artifact** and present findings to the operator before implementation begins.

---

## Environment / Preconditions

- If GrowthBook is chosen: `GROWTHBOOK_CLIENT_KEY` and `GROWTHBOOK_API_HOST` env vars must be added to `src/core/env.ts` and `.env.example`.
- If DB-backed flags are chosen: no new env vars needed but Drizzle schema changes are in scope (deferred to a follow-up task if complex).
- Local dev: `InMemoryFeatureFlagService` should be the default fallback when no provider is configured.

---

## Evidence Expectations

- `01 - Architecture Guard - Summary.md` — decision on provider strategy and contract shape.
- Unit tests for new adapter (`isEnabled` returns expected values for configured flags).
- `pnpm typecheck` output (clean).
- `pnpm lint --fix` output (clean).
- `pnpm test` result (passing).
- Dependency boundary scan results (clean).

---

## Open Questions

1. **OpenFeature as adapter vs. mandatory**: Should `OpenFeatureFeatureFlagService` be a proper adapter wrapping `@openfeature/server-sdk`, or should it be removed in favour of direct provider adapters? _(Architecture Guard decision — see below)_
2. **Contract shape**: Should `getVariant()` be added to `FeatureFlagService` now, or explicitly deferred? The docs describe it; the code omits it.
3. **Provider choice**: GrowthBook direct SDK, DB-backed, or something else for the first real adapter?
4. **`FeatureFlagContext` vs. `AuthorizationContext`**: The docs describe a separate context shape (`userId`, `tenantId`, `attributes`). The code uses `AuthorizationContext`. Which is correct for this repo?
5. **DI token naming**: The code has `FEATURE_FLAGS.SERVICE`; the docs reference `FEATURE_FLAGS.PROVIDER`. Which is authoritative?
6. **Composition root location**: Where is the DI bootstrap for server-side composition in this repo? Needs verification before wiring.

---

## Recommended Next Action

Run **Architecture Guard Agent** on this intake.

The guard must:

1. Confirm or reject the local adapter/contract pattern vs. OpenFeature mandatory dependency.
2. Assess the `FeatureFlagService` contract shape (`AuthorizationContext` vs. separate `FeatureFlagContext`; `getVariant` deferral).
3. Identify the docs drift risk and classify it.
4. Produce `01 - Architecture Guard - Summary.md`.
5. **Stop and present findings to the operator** (manual-handoff) before implementation begins.
