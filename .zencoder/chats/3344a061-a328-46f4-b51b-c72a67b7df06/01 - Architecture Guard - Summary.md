# 01 - Architecture Guard - Summary

## Task Context

- **Task ID**: feature-flags-use-case
- **Task Objective**: Determine provider strategy (OpenFeature vs. local adapter pattern), implement first production adapter, wire into DI, define consumption patterns, resolve docs drift.
- **Current Run Scope**: Architecture strategy decision and structural assessment — no implementation.
- **Status**: COMPLETED
- **Last Updated**: 2026-04-01
- **Related Control Artifacts**: `intake.md` in this chat directory.

---

## Scope Handled

- Modules / layers reviewed: `src/core/contracts/`, `src/core/contracts/index.ts`, `src/core/runtime/bootstrap.ts`, `src/modules/feature-flags/`
- Architecture questions in scope: OpenFeature vs. local adapter; contract shape; context type; DI wiring gap; docs drift
- Change surface reviewed: feature-flags module full, bootstrap composition root, DI token registry, all existing adapters

---

## Inputs Reviewed

- `src/core/contracts/feature-flags.ts` — live contract
- `src/core/contracts/index.ts` — DI token registry
- `src/core/runtime/bootstrap.ts` — Node.js composition root
- `src/modules/feature-flags/index.ts` — module exports
- `src/modules/feature-flags/infrastructure/memory/InMemoryFeatureFlagService.ts` — working adapter
- `src/modules/feature-flags/infrastructure/memory/InMemoryFeatureFlagService.test.ts` — unit tests
- `src/modules/feature-flags/infrastructure/openfeature/OpenFeatureFeatureFlagService.ts` — throwing stub
- `docs/tanstack-migration/14-feature-flags.md` — migration doc (TanStack origin)
- `docs/prompts/03 - Per-Tenant Feature Flags Prompt.md` — Next.js feature prompt

---

## Actions Performed

- Full read of all feature-flags module files
- Read `createRequestContainer()` in `bootstrap.ts` to verify DI wiring
- Read `src/core/contracts/index.ts` to verify DI token names
- Read existing tests to confirm `AuthorizationContext` usage
- Compared docs against code to identify drift

---

## Current-State Findings

### Confirmed (Code Facts)

1. **Contract**: `FeatureFlagService` in `src/core/contracts/feature-flags.ts` — single method: `isEnabled(flag: string, context: AuthorizationContext): Promise<boolean>`. Boolean only. No `getVariant`. No `FeatureFlagContext`. Depends on `AuthorizationContext` from `@/core/contracts/authorization`.

2. **DI Token**: `FEATURE_FLAGS.SERVICE = Symbol('FeatureFlagService')` in `src/core/contracts/index.ts`. Token is named `SERVICE`, not `PROVIDER` as some docs describe.

3. **InMemoryFeatureFlagService**: Correctly implements `FeatureFlagService`. Has full unit test coverage (4 cases). Safe for test/local-dev fallback.

4. **OpenFeatureFeatureFlagService**: Implements `FeatureFlagService` signature but throws `new Error('OpenFeatureFeatureFlagService: not implemented')` from `isEnabled`. It is a non-functional throwing stub. It must NOT be registered in any container.

5. **DI Wiring Gap — CRITICAL**: `createRequestContainer()` in `src/core/runtime/bootstrap.ts` does **not** register `FEATURE_FLAGS.SERVICE` at all. Any call to resolve this service from the container in production will fail at runtime. Feature flags cannot be used in any production path today.

6. **Module exports**: `src/modules/feature-flags/index.ts` exports both adapters — including the throwing `OpenFeatureFeatureFlagService`. Exporting an unusable stub is a smell.

---

## Docs vs Code Drift

### MINOR — Naming drift

`docs/tanstack-migration/14-feature-flags.md` describes:

- Interface name `FeatureFlagProvider` — the real name is `FeatureFlagService`
- DI token `FEATURE_FLAGS.PROVIDER` — the real token is `FEATURE_FLAGS.SERVICE`

### MINOR — Extra method not in contract

The same doc describes `getVariant(flagKey, context): Promise<string | null>` on the provider interface. This method does not exist in the live contract or any implementation.

### MINOR — Context type drift

The doc describes a separate `FeatureFlagContext` shape (`userId`, `tenantId`, `attributes`). The real contract uses `AuthorizationContext` (contains `tenant.tenantId`, `subject.id`, `resource`, `action`). These are different shapes.

### INFORMATIONAL — Source of drift

`14-feature-flags.md` is a TanStack migration document, not a Next.js repo spec. Its contract shapes reflect a different boilerplate. It should be explicitly deprecated or corrected to reflect the Next.js implementation.

---

## Boundary and Dependency Assessment

### Module ownership

- `FeatureFlagService` contract lives in `src/core/contracts/` — correct layer (core owns contracts).
- Adapters live in `src/modules/feature-flags/infrastructure/` — correct layer (modules own infrastructure).
- DI token lives in `src/core/contracts/index.ts` — correct.
- No boundary violations in existing code.

### Dependency direction

- `InMemoryFeatureFlagService` imports from `@/core/contracts/` only — direction is correct (`modules → core`).
- `OpenFeatureFeatureFlagService` imports from `@/core/contracts/` only — direction is correct, but it imports no `@openfeature/server-sdk`. It is purely nominal.

### DI / Composition

- `createRequestContainer()` creates a Node.js-scoped request container. Feature flags belong here (tenant-scoped evaluation requires request context).
- **Gap**: `FEATURE_FLAGS.SERVICE` is not registered. This is the single most urgent structural gap in the module.
- `InMemoryFeatureFlagService` should be the registered default until a real adapter is ready.

### Cross-module coupling

- No cross-module coupling observed. The module is correctly isolated.

---

## Architectural Decisions / Constraints

### Decision 1 — Provider Strategy: APPROVED (local adapter pattern)

**The local adapter/contract pattern is architecturally correct for this repository. OpenFeature must NOT be a mandatory dependency.**

Rationale:

- `FeatureFlagService` is already a clean, provider-agnostic contract. App code depends only on it — not on any vendor SDK.
- Making OpenFeature mandatory would either (a) expose SDK-specific types (`OpenFeature.Client`, `EvaluationContext`, `Provider`) in the contract layer, violating provider isolation, or (b) require a thin wrapping adapter anyway — at which point the only "benefit" is a standardised adapter interface the repo can define locally at zero extra dependency cost.
- This boilerplate must support provider replacement behind stable contracts (see `AGENTS.md` forward-compatibility rules). A mandatory OpenFeature dependency inverts this: the repo's contract would have to conform to OpenFeature's API surface, not the other way around.
- OpenFeature can be used as one infrastructure adapter (wrapping `@openfeature/server-sdk`) if a project-specific need arises. That is legitimate. Making it the governance layer is not.

**Verdict**: The operator's instinct is correct. OpenFeature as the app-facing contract is rejected. OpenFeature as one possible infrastructure adapter in future is permitted.

### Decision 2 — Contract Shape: APPROVED as-is; getVariant EXPLICITLY DEFERRED

The minimal `isEnabled(flag, context): Promise<boolean>` contract is correct for this stage.

- `getVariant()` is absent from the contract. This is the right decision now. Variants require a deliberate contract evolution when an actual use case arrives. It must not be added speculatively to match docs that came from a different boilerplate.
- When variants are genuinely needed, a deliberate contract extension with guard review is required.

**Variant addition is prohibited in this task without a new guard review.**

### Decision 3 — Context Type: APPROVED (AuthorizationContext)

Using `AuthorizationContext` as the flag evaluation context is correct:

- `AuthorizationContext` already carries `tenant.tenantId` and `subject.id` — the fields any real provider needs for tenant-scoped evaluation.
- Introducing a separate `FeatureFlagContext` shape would duplicate context construction and add a mapping step with no benefit.
- A provider adapter that needs a specific shape (e.g., GrowthBook's `attributes`) must map from `AuthorizationContext` internally inside the adapter — the contract must not change.

**`FeatureFlagContext` is rejected. `AuthorizationContext` is the canonical evaluation context.**

### Decision 4 — DI Token Naming: APPROVED as-is (SERVICE)

`FEATURE_FLAGS.SERVICE` is the authoritative DI token name. Any docs referencing `FEATURE_FLAGS.PROVIDER` are drifted.

### Decision 5 — OpenFeatureFeatureFlagService stub: REMOVE

The throwing stub must be removed from the module. Reasons:

- It is exported from `index.ts`, signalling it is usable. It is not.
- A throwing stub that reaches production causes runtime failure, not graceful degradation.
- If a project wants an OpenFeature adapter in future, it should be built then, not pre-declared now as a stub.

**Approved change: delete `src/modules/feature-flags/infrastructure/openfeature/OpenFeatureFeatureFlagService.ts` and remove its export from `index.ts`.**

### Decision 6 — DI Bootstrap Wiring: MUST BE DONE

`FEATURE_FLAGS.SERVICE` must be registered in `createRequestContainer()`. Safe default: `InMemoryFeatureFlagService` registered unconditionally until a real provider config is available. A real provider (e.g., GrowthBook) can replace it when env vars are present.

**Approved wiring**:

```typescript
import { InMemoryFeatureFlagService } from '@/modules/feature-flags/infrastructure/memory/InMemoryFeatureFlagService';

container.register(FEATURE_FLAGS.SERVICE, new InMemoryFeatureFlagService());
```

This change must be part of the implementation task. Without it, feature flags remain non-functional in all environments.

### Rejected Directions

| Direction                                      | Verdict  | Reason                                                                    |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| OpenFeature as mandatory app-facing contract   | REJECTED | Couples app to vendor SDK; inverts provider isolation                     |
| `FeatureFlagContext` (separate type)           | REJECTED | Duplicates `AuthorizationContext`; adds mapping overhead with no gain     |
| `getVariant()` on `FeatureFlagService`         | DEFERRED | No current use case; requires new guard review when needed                |
| Keeping `OpenFeatureFeatureFlagService` stub   | REJECTED | Unusable throwing stub exported as usable                                 |
| Renaming `FEATURE_FLAGS.SERVICE` to `PROVIDER` | REJECTED | `SERVICE` is already in use; renaming breaks existing code for no benefit |

### Approved Changes (for implementation task)

| Change                                                                     | Priority                                   |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| Remove `OpenFeatureFeatureFlagService` and its index export                | HIGH                                       |
| Register `FEATURE_FLAGS.SERVICE → InMemoryFeatureFlagService` in bootstrap | CRITICAL (unblocks all feature gate usage) |
| Implement first real provider adapter (GrowthBook or DB-backed)            | HIGH                                       |
| Deprecate or correct `docs/tanstack-migration/14-feature-flags.md`         | LOW                                        |
| Add server-side consumption helper (`isFeatureEnabled(flag, ctx)`)         | MEDIUM                                     |

---

## Open Questions / Blockers

1. **Which real provider first?** GrowthBook (external SDK) or DB-backed (Drizzle, simpler, no external dependency)? This affects whether new env vars are needed. Recommendation: start with a DB-backed or static-config adapter that requires no external service, then add GrowthBook as a second adapter when a project needs it.

2. **GrowthBook adapter latency**: GrowthBook `gb.init()` on every request is expensive. If GrowthBook is chosen, the adapter should use a cached SDK instance, not per-request initialisation. This is an implementation concern for the implementation agent.

3. **Edge runtime**: Does `src/core/runtime/edge.ts` need `FEATURE_FLAGS.SERVICE` registered too? If any Edge route performs flag checks, the edge container must also wire the service. Verify during implementation.

---

## Handoff Notes

- **What the next agent should rely on**: Decisions 1–6 above are binding for the implementation task. No re-decision without new evidence.
- **What must not be re-decided without new evidence**: Provider strategy (local adapters), context type (`AuthorizationContext`), `getVariant` deferral, stub removal.
- **Recommended next specialist**: Implementation Agent — using this summary and `intake.md` as inputs.
- **Execution control**: `manual-handoff` — the operator must review this artifact before implementation begins.

---

## Update Log

### Update Entry

- **Date**: 2026-04-01
- **Trigger**: Initial task intake for feature-flags use-case.
- **Summary of change**: Full architecture review. Six binding decisions made. Critical DI wiring gap identified. Docs drift catalogued.
- **Sections refreshed**: All sections (initial entry).

---

### Update Entry — Demo Design Review (Step 13)

- **Date**: 2026-04-01
- **Trigger**: User requested a feature-flags demo page (Phase 3).
- **Summary of change**: Architecture Guard reviewed proposed demo design. Seven binding decisions produced for the demo implementation.

#### Demo Binding Decisions

**D1 — Route location: APPROVED**
`src/app/feature-flags-demo/page.tsx` as an async RSC page. Mirrors `src/app/security-showcase/page.tsx` exactly. Public, no auth required.

**D2 — DI resolution pattern: APPROVED**
Resolve `FEATURE_FLAGS.SERVICE` via `getAppContainer().createChild()`. This is the established pattern for RSC pages in this repo (confirmed in `security-showcase/page.tsx`). No alternative pattern needed.

**D3 — Synthetic `AuthorizationContext` for demo: APPROVED WITH CONSTRAINT**

- `TenantId` and `SubjectId` are both `string` — type-safe to use literal values.
- The static adapter ignores context, so `{ tenantId: 'demo', subjectId: 'anonymous' }` is safe.
- For DB/GrowthBook adapters, the anonymous context returns `false` for all flags — the correct default (no demo flags exist for `tenantId='demo'` in those adapters).
- **CONSTRAINT**: Name the constant `demoAuthContext` (not `guestContext`). Add an inline comment: `// Demo-only synthetic context — carries no security significance.` The RSC page must display a visible note that evaluation uses an anonymous demo context.

**D4 — Exposing active provider name: APPROVED WITH CONSTRAINT**

- The RSC page (`page.tsx`) may read `env.FEATURE_FLAG_PROVIDER` directly. It is a server component; `env` is the validated T3-Env schema. Reading it here is safe and consistent with how other pages read env.
- **CONSTRAINT**: Pass the provider value as a prop to components (`provider: string`). Components must NOT import or read `env` themselves. Do NOT add any method to `FeatureFlagService` or the contract to expose provider identity — that would leak infrastructure concern into the contract boundary.

**D5 — Feature module location: APPROVED**
`src/features/feature-flags-showcase/components/` is the correct location. This matches the existing `src/features/security-showcase/` pattern.

**D6 — Homepage link placement: APPROVED WITH APPROACH**

- Do NOT modify `FeaturesGrouped.tsx` to add a dynamic link (it is a static marketing section).
- Add `Feature Flags` as a named entry in `FeaturesGrouped.tsx` under an appropriate group (e.g., "Production Resilience & Security") as a static text feature description — no link needed there.
- Add a navigational link to `/feature-flags-demo` in the `Hero.tsx` or `CTA.tsx` section, or as a plain `<Link>` in the page footer. Keep it unobtrusive — one small link is sufficient.

**D7 — No new contract methods: BINDING**
Do NOT add `getProviderName()`, `getProviderType()`, or any introspection method to `FeatureFlagService`. The contract stays: `isEnabled(flag, context): Promise<boolean>`. Provider identity is an infrastructure detail, not an app contract.

#### Demo Component Constraint

- `FeatureFlagStatusCard.tsx` receives `{ flagName: string; enabled: boolean; provider: string }` as props.
- No component may import from `@/modules/feature-flags/**` directly. All flag evaluation happens in the RSC page.
- No component may import `env` from `@/core/env`.

#### Demo Flag Pre-Configuration

Add to `.env.example` (if not already present from Step 2):

```bash
FEATURE_FLAGS_STATIC=demo.new-dashboard-ui=true,demo.beta-exports=false,demo.experimental-analytics=true
```

- **Sections refreshed**: Added demo design review section with 7 binding decisions.
