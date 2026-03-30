# Architecture Review — Clerk Sign-Up & Provisioning Flow

**Agent**: Architecture Guard Agent  
**Inputs**: incident-intake.md, security-review.md, runtime-review.md  
**Date**: 2026-03-13

---

## 1. Objective

Assess whether the current provisioning flow respects the repository's modular-monolith boundaries, dependency direction, DI discipline, and ownership model. Identify which structural misalignments directly contribute to or enable the documented failures. Determine the minimum safe structural remediation shape without proposing broad refactors.

---

## 2. Current-State Findings

### 2.1 Module Ownership Map (Provisioning-Related)

Verified in code:

| Concern                               | Layer                                                 | File                            |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| Provisioning domain contract          | `modules/provisioning/domain`                         | `ProvisioningService.ts`        |
| Provisioning implementation           | `modules/provisioning/infrastructure`                 | `DrizzleProvisioningService.ts` |
| Tenant resolvers (all modes)          | `modules/provisioning/infrastructure`                 | `*TenantResolver.ts`            |
| Active tenant sources (header/cookie) | `modules/provisioning/infrastructure/request-context` | `*ActiveTenantSource.ts`        |
| Auth module wiring (composition root) | `modules/auth/index.ts`                               | `createAuthModule()`            |
| Bootstrap orchestration               | `app/auth/bootstrap/page.tsx`                         | delivery layer                  |
| Onboarding orchestration              | `modules/auth/ui/onboarding-actions.ts`               | **module UI layer — misplaced** |
| Onboarding guard                      | `app/onboarding/layout.tsx`                           | delivery layer                  |
| Provisioning gate (Node)              | `security/core/node-provisioning-access.ts`           | security layer                  |

### 2.2 Provisioning Public Module Index

**File**: `src/modules/provisioning/index.ts`

The provisioning module's public index exports:

- `ProvisioningInput`, `ProvisioningResult`, `ProvisioningService` (contract types)
- `TenantContextRequiredError`, `TenantUserLimitReachedError`, `MissingProvisioningInputError`, `CrossProviderLinkingNotAllowedError` (domain errors)
- `DrizzleProvisioningService` (infrastructure)

It does **NOT** export the tenant resolvers (`OrgDbTenantResolver`, `SingleTenantResolver`, etc.) — these are internal infrastructure types.

### 2.3 Internal Bypass — Direct Import from `domain/` Sub-paths

**Files**: `src/app/auth/bootstrap/page.tsx`, `src/modules/auth/ui/onboarding-actions.ts`

Both files import directly from `@/modules/provisioning/domain/errors` and `@/modules/provisioning/domain/ProvisioningService` — bypassing the provisioning module's public index.

```typescript
// bootstrap/page.tsx — bypasses provisioning/index.ts
import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning/domain/errors'; // ← bypasses public index
import type { ProvisioningService } from '@/modules/provisioning/domain/ProvisioningService'; // ← bypasses public index
```

Both of these are exported by `modules/provisioning/index.ts`. The bypass is gratuitous — there is no reason these can't be imported from the public index. **Rule violated**: importing module internals when the public contract exports the same symbols.

### 2.4 `modules/auth/index.ts` — Composition Root Cross-Module Wiring

**File**: `src/modules/auth/index.ts`

`createAuthModule()` imports 8 concrete classes directly from `@/modules/provisioning/infrastructure/...`:

```typescript
import { OrgDbTenantResolver } from '@/modules/provisioning/infrastructure/OrgDbTenantResolver';
import { OrgProviderTenantResolver } from '@/modules/provisioning/infrastructure/OrgProviderTenantResolver';
import { PersonalTenantResolver } from '@/modules/provisioning/infrastructure/PersonalTenantResolver';
import { SingleTenantResolver } from '@/modules/provisioning/infrastructure/SingleTenantResolver';
import { CompositeActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CompositeActiveTenantSource';
import { CookieActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CookieActiveTenantSource';
import { HeaderActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/HeaderActiveTenantSource';
```

**Assessment**: `createAuthModule()` is the module factory — it is the composition root for the auth module. Composition roots legitimately wire concrete implementations from other modules to fulfill contract registrations. This coupling is intentional: the auth module is responsible for wiring the correct `TenantResolver` implementation (which lives in provisioning because that's where tenancy resolution lives).

**However**: This means the `auth` module is acting as both (a) its own module and (b) the composition orchestrator for provisioning tenant resolvers. This is a structural smell: the tenant resolver wiring arguably belongs in the composition root at `src/core/runtime/bootstrap.ts` (or a dedicated provisioning module factory), not inside the auth module factory.

Today it works because the DI token `AUTH.TENANT_RESOLVER` is registered by the auth module, and the resolver implementations come from provisioning. The coupling is at the composition point. This is the least-bad current arrangement but creates an implicit authority ambiguity: who owns the `TenantResolver` — auth or provisioning?

**This is a MAJOR architectural smell, not a blocker for the immediate incident**, but it is the structural root of the duplication problem.

### 2.5 `onboarding-actions.ts` — Misplaced in Module UI Layer

**File**: `src/modules/auth/ui/onboarding-actions.ts`

This file is marked `'use server'` and lives in `src/modules/auth/ui/`. Per the repository's dependency model:

- `modules/` = isolated business/integration modules
- `modules/*/ui/` = module-level UI adapters (e.g., `HeaderWithAuth.tsx`)

`onboarding-actions.ts` is NOT a UI adapter. It is a **cross-module orchestration server action** that:

1. Reads Clerk identity claims (auth module concern)
2. Calls `ensureProvisioned` (provisioning module concern)
3. Calls `userRepository.updateProfile` (user module concern)
4. Calls `userRepository.updateOnboardingStatus` (user module concern)

This is feature-level orchestration spanning auth + provisioning + user modules. It should live at:

- `src/app/onboarding/actions.ts` (delivery layer — appropriate per global dependency rules since `app → modules` is allowed), or
- `src/features/user-onboarding/` (if a feature module for onboarding existed)

Placing it in `modules/auth/ui/` gives false ownership signals: the auth module appears to own onboarding orchestration, but it cannot (and should not) — onboarding spans multiple modules.

**Impact on the incident**: This is where RC-5 (the duplicate `resolveActiveTenantIdForProvisioning`) lives. Because the server action is misplaced, the duplication between bootstrap (app layer) and the action (module layer) is harder to notice and harder to fix cleanly.

### 2.6 `resolveActiveTenantIdForProvisioning` — Logic Duplication AND Abstraction Bypass

**Files**: `src/app/auth/bootstrap/page.tsx`, `src/modules/auth/ui/onboarding-actions.ts`

The function appears identically in both files:

```typescript
async function resolveActiveTenantIdForProvisioning(): Promise<
  string | undefined
> {
  if (env.TENANCY_MODE === 'single') {
    return env.DEFAULT_TENANT_ID;
  }
  if (env.TENANCY_MODE === 'org' && env.TENANT_CONTEXT_SOURCE === 'db') {
    const headerList = await headers();
    const headerTenantId = headerList.get(env.TENANT_CONTEXT_HEADER);
    if (headerTenantId) return headerTenantId;
    const cookieStore = await cookies();
    return cookieStore.get(env.TENANT_CONTEXT_COOKIE)?.value;
  }
  return undefined;
}
```

This function re-implements the **same logic already abstracted** in `CompositeActiveTenantSource` → `HeaderActiveTenantSource` + `CookieActiveTenantSource` in `modules/provisioning/infrastructure/request-context/`.

The provisioning module built proper abstractions for active tenant resolution. The calling code ignores those abstractions and hand-rolls the same logic twice. The abstractions exist for the **read path** (post-provisioning tenant resolution), but the **write path** (provisioning input assembly) duplicates the same resolution without using them.

**Root cause of duplication**: There is no shared `ProvisioningInputFactory` or `buildProvisioningInput()` utility that assembles the complete `ProvisioningInput` from identity source + active tenant source + env. Bootstrap and onboarding action each assemble `ProvisioningInput` independently, duplicating both the active tenant resolution logic and the direct env reads (`env.AUTH_PROVIDER`, `env.TENANCY_MODE`, etc.).

### 2.7 `resolveActiveTenantIdForProvisioning` Is NOT a Complete Abstraction

The function only resolves `activeTenantId`. The full `ProvisioningInput` assembly also reads:

- `rawIdentity.userId`, `rawIdentity.email`, `rawIdentity.emailVerified`, `rawIdentity.tenantExternalId`, `rawIdentity.tenantRole` (from identity source)
- `env.AUTH_PROVIDER`, `env.TENANCY_MODE`, `env.TENANT_CONTEXT_SOURCE` (from env)

These are assembled inline in both files with identical code. The full `ProvisioningInput` assembly is the duplicated concern, not just the tenant ID piece.

### 2.8 Redirect Ownership — `UsersLayout` → `/onboarding` Loop

**Files**: `src/app/users/layout.tsx`, `src/app/onboarding/layout.tsx`

`UsersLayout` redirects to `/onboarding?reason=tenant-context-required` when `TENANT_CONTEXT_REQUIRED`. The onboarding guard (`OnboardingGuard`) redirects to `/users` when `user.onboardingComplete === true`. This is a **hard redirect loop** — no structural owner resolves the conflict between "user completed onboarding but needs tenant context" and "user completed onboarding so skip to /users."

Architecturally: the `TENANT_CONTEXT_REQUIRED` case has a different semantics than `ONBOARDING_REQUIRED`. They share a redirect target (`/onboarding`) only by coincidence of the current implementation. The onboarding guard only knows about onboarding completion — it has no awareness of tenant context requirements. The loop is a consequence of mapping two distinct failure modes to the same recovery route.

### 2.9 DI Discipline — `getAppContainer()` Called From Multiple Layers

**Files**: `bootstrap/page.tsx`, `app/onboarding/layout.tsx`, `app/users/layout.tsx`, `modules/auth/ui/onboarding-actions.ts`

`getAppContainer()` is called from:

- delivery layer pages/layouts (architecturally appropriate)
- a module's `ui/` directory (architecturally inappropriate — modules should not call the global composition root)

Per **ARCHITECTURE_LINT_RULES Rule A6**: global container usage in request-sensitive flows is a `WARNING` smell. The onboarding server action calling `getAppContainer()` from inside a module is a service-locator pattern where the module reaches up to the composition root rather than having dependencies injected.

This is not a hard failure on the current baseline (the rule is Warning-level), but it reinforces the ownership problem: `onboarding-actions.ts` behaves as if it's in the delivery layer (calls `getAppContainer()` like delivery code does) but is physically in a module.

---

## 3. Docs vs Code Drift

### Drift 1 — Request Lifecycle Diagram Missing RSC Bootstrap/Onboarding

**File**: `docs/architecture/03 – Request Lifecycle.md`

The diagram shows `NodeEntry: "Server Action / Route Handler"` as the Node-tier entry. Bootstrap RSC page (`app/auth/bootstrap/page.tsx`) and onboarding layout (`app/onboarding/layout.tsx`) are RSC pages/layouts — they are Node-tier entry points that call `getAppContainer()`, resolve services, and execute domain operations. They are NOT shown in the lifecycle diagram. The diagram understates the Node execution surface by omitting RSC pages/layouts as provisioning entry points.

**Classification**: Stale flow description. Architecture drift risk (future contributors following the diagram may not realize RSC layouts are Node-tier provisioning gates).

### Drift 2 — Composition Root Architecture Diagram Missing Bootstrap RSC Path

**File**: `docs/architecture/02 – Composition Root Architecture.md`

The diagram shows `AppC → NodeC → AuthMod → AuthzMod` as the Node path. There is no path showing RSC pages (`bootstrap/page.tsx`, `onboarding/layout.tsx`) directly calling `getAppContainer()`. These pages effectively act as delivery-layer entry points into the Node request container. The diagram implies only server actions and route handlers go through `NodeC`.

**Classification**: Stale flow description. Coupled to Drift 1 above.

### Drift 3 — No Architecture Document for Bootstrap/Provisioning Flow

There is no `docs/architecture/*.md` file that describes the bootstrap page's role, provisioning input assembly, or the relationship between bootstrap and onboarding action. Given the complexity of the multi-mode provisioning flow (4 tenancy modes × 2 tenant sources), this is a significant documentation gap.

**Classification**: Missing documentation. Not a drift — it never existed. Increases fragility risk.

### Drift 4 — `ARCHITECTURE_LINT_RULES` Approved Exception Is Scoped to `src/core/container/*`

**File**: `docs/ai/general/ARCHITECTURE_LINT_RULES.md`

The approved composition-root exception is documented as: "composition-root registration inside `src/core/container/*`". The actual composition root for request containers is `src/core/runtime/bootstrap.ts`, which is in `core/runtime/`, not `core/container/`. The lint rule's scope is narrower than the actual approved exception in code.

**Classification**: Minor wording drift in lint doc. No functional impact.

---

## 4. Architectural Assessment

### What Is Sound

1. **Dependency direction**: The global rules (app → modules → core) are largely respected. No core reverse dependencies found. No security-layer imports from modules.
2. **DI contracts**: `ProvisioningService`, `IdentityProvider`, `TenantResolver`, `UserRepository` are all resolved via DI tokens — no direct instantiation of infrastructure in delivery code.
3. **Provisioning service is transactional and domain-owned**: `DrizzleProvisioningService` is fully encapsulated in the provisioning module. The bootstrap and onboarding action correctly call it through the DI token `PROVISIONING.SERVICE`.
4. **Tenant resolvers are properly abstracted**: The `TenantResolver` contract lives in `core/contracts/tenancy.ts`. Implementations are in provisioning infrastructure. The auth module wires the correct implementation. This is sound.
5. **`evaluateNodeProvisioningAccess` is properly separated**: The provisioning access evaluator is in `security/core/` — a reusable pure function. `UsersLayout` delegates to it via `resolveNodeProvisioningAccess`. No security logic in UI.

### What Is Structurally Misaligned

**Problem 1 (MAJOR)**: `onboarding-actions.ts` owns cross-module orchestration from inside a module's `ui/` folder.

The server action calls into provisioning + user modules with no module boundary. Its physical location in `modules/auth/ui/` is misleading and structurally wrong. Server actions that orchestrate across module boundaries belong in the delivery layer (`app/`) or a feature composition layer (`features/`).

This is not only a naming smell — it creates the duplication problem. Bootstrap (delivery layer) and onboarding action (module layer) are peers in the provisioning flow but live at different layers, making shared extraction awkward.

**Problem 2 (MAJOR)**: No single owned point for provisioning input assembly.

`ProvisioningInput` is assembled at two independent call sites with no shared factory. The provisioning module has the abstractions (`CompositeActiveTenantSource`, `HeaderActiveTenantSource`, `CookieActiveTenantSource`) but they are not used for input assembly — they are only used for post-provisioning read-path tenant resolution. The write path (provisioning input assembly) is hand-rolled separately in both callers.

This creates a structural gap: if a new tenancy mode or input field is added, both callers must be updated independently.

**Problem 3 (MINOR)**: Direct import of provisioning module internals instead of public index.

`bootstrap/page.tsx` and `onboarding-actions.ts` both bypass `modules/provisioning/index.ts` and import directly from `domain/errors` and `domain/ProvisioningService`. These symbols ARE exported from the public index. The bypass is gratuitous and weakens module boundary clarity.

**Problem 4 (MAJOR)**: Redirect loop — `TENANT_CONTEXT_REQUIRED` routed to `/onboarding` which guards against completed onboarding.

Two distinct failure modes (`ONBOARDING_REQUIRED` and `TENANT_CONTEXT_REQUIRED`) share the same recovery route (`/onboarding`) despite having incompatible guard semantics. The onboarding layout guard does not distinguish between these two cases. No shared owner or routing rule resolves the conflict. This is a structural gap, not just a routing mistake.

**Problem 5 (INFORMATIONAL)**: Provisioning tenant resolver ownership is split between `auth` and `provisioning` modules.

`TenantResolver` implementations live in `provisioning/infrastructure`, but wiring (which resolver to use) happens in `auth/index.ts`. This works today because `auth` acts as the composition orchestrator, but the authority ambiguity — who owns tenancy routing? — will become sharper as new modes are added.

---

## 5. Risks

### MAJOR

**AR-1** — Onboarding server action misplaced in module UI layer

- `modules/auth/ui/onboarding-actions.ts` owns cross-module orchestration (provisioning + user) from a module's UI layer.
- Creates false ownership signal: auth module appears to own onboarding, but it cannot (spans multiple modules).
- Directly causes the duplication of `resolveActiveTenantIdForProvisioning` (bootstrap in app/ can't cleanly share utilities with onboarding-actions in modules/).
- Any future extension of the provisioning input (new tenancy mode, new field) must be updated in two unrelated files at different layers.
- Rule A7 (domain logic outside owned layers): WARNING → escalates to MAJOR given the orchestration scope.

**AR-2** — No shared provisioning input assembly — abstraction exists but is bypassed

- `CompositeActiveTenantSource` + `HeaderActiveTenantSource` + `CookieActiveTenantSource` already abstract active tenant resolution for the read path.
- The write path (provisioning input assembly) ignores these abstractions and re-implements the same logic.
- If the tenant context resolution logic diverges between read path and write path (e.g., a new source is added to `CompositeActiveTenantSource` but not to `resolveActiveTenantIdForProvisioning`), provisioning will fail to find the right tenant while the read path succeeds — producing a confusing mismatch.

**AR-3** — Redirect loop: `TENANT_CONTEXT_REQUIRED` → `/onboarding` → `/users` → loop

- Structural gap: two distinct error states routed to the same recovery path with incompatible guards.
- No escape hatch. Users are permanently looped with no error message.
- Must be fixed at the routing/flow level, not just the error message level.

### MINOR

**AR-4** — Direct provisioning internal path imports (bypass of public index)

- `bootstrap/page.tsx` and `onboarding-actions.ts` import from `@/modules/provisioning/domain/errors` and `@/modules/provisioning/domain/ProvisioningService` directly.
- The provisioning public index exports these symbols. The bypass is gratuitous.
- Low immediate risk. Weakens module boundary clarity and makes future refactoring of provisioning internals harder.

**AR-5** — `auth/index.ts` acts as composition orchestrator for provisioning tenant resolvers

- Auth module factory imports and wires 7 concrete classes from provisioning infrastructure.
- Semantically, tenant resolver selection belongs to either the provisioning module or the global composition root, not the auth module.
- Not a hard violation (composition roots legitimately cross module lines) but creates authority ambiguity: who owns `AUTH.TENANT_RESOLVER`?
- Low blast radius to fix (move wiring to `createRequestContainer` in `bootstrap.ts`), but this is a separate refactor from the incident fix.

### INFORMATIONAL

**AR-6** — Documentation gap: no architectural doc for the bootstrap/provisioning flow

- Given the 4-mode × 2-source complexity, the absence of any flow documentation makes the failure modes invisible to future maintainers.
- Not a code problem. But increases the blast radius of future changes.

---

## 6. Recommended Next Action

### The Minimum Safe Structural Remediation Shape

The following changes are ordered by necessity and blast radius. Changes 1–3 are required for the incident fix to be structurally clean. Changes 4–5 are follow-up improvements that do not block implementation.

---

**Change 1 (Required): Extract shared provisioning input assembly**

Create a single server-side utility:  
`src/modules/auth/infrastructure/clerk/buildProvisioningInput.ts`  
(or: `src/app/auth/bootstrap/build-provisioning-input.ts` if scoped to the bootstrap flow)

This function assembles `ProvisioningInput` from:

- `RequestIdentitySourceData` (already resolved by caller)
- Request context (`headers()`, `cookies()`) for `activeTenantId` in `org+db` mode
- `env.*` for `tenancyMode`, `tenantContextSource`, `provider`

Both `bootstrap/page.tsx` and `onboarding-actions.ts` import and call this single function.  
**Constraint**: Server-only (uses Next.js `headers()`/`cookies()`). Must not be imported from client components.

---

**Change 2 (Required): Move `onboarding-actions.ts` to the delivery layer**

Move `src/modules/auth/ui/onboarding-actions.ts` → `src/app/onboarding/actions.ts`

This is a file move with no logic changes. The server action is consumed only by `src/app/onboarding/onboarding-form.tsx` — it belongs in the same delivery context as the form that calls it.

After the move:

- `onboarding-form.tsx` import path changes
- No other consumers in production code
- The auth module's `ui/` directory retains only `HeaderWithAuth.tsx`, `HeaderAuthControls.tsx`, `HeaderAuthFallback.tsx` — correctly scoped to module-level UI components

**Blast radius**: Single import path change in `onboarding-form.tsx`.

---

**Change 3 (Required): Fix the `TENANT_CONTEXT_REQUIRED` redirect loop**

In `src/app/users/layout.tsx`, change:

```typescript
if (access.status === 'TENANT_CONTEXT_REQUIRED') {
  redirect('/onboarding?reason=tenant-context-required'); // ← causes loop
}
```

To:

```typescript
if (access.status === 'TENANT_CONTEXT_REQUIRED') {
  redirect('/auth/bootstrap?reason=tenant-lost'); // ← bootstrap handles recovery
}
```

The bootstrap page is the appropriate recovery point for tenant context failures — it already handles `TenantContextRequiredError` and can be extended to differentiate between "first-time no org" and "lost org context" via the `reason` query param.

---

**Change 4 (Follow-up, not blocking): Fix provisioning public index bypass**

In `bootstrap/page.tsx` and the new `app/onboarding/actions.ts`, change:

```typescript
// From:
import { ... } from '@/modules/provisioning/domain/errors';
import type { ProvisioningService } from '@/modules/provisioning/domain/ProvisioningService';

// To:
import { ..., type ProvisioningService } from '@/modules/provisioning';
```

Low blast radius. No logic change.

---

**Change 5 (Follow-up, not blocking): Move tenant resolver wiring out of `auth/index.ts`**

Move the `buildTenantResolver()` function and its provisioning infrastructure imports from `modules/auth/index.ts` to `src/core/runtime/bootstrap.ts` (`createRequestContainer`).

Register `AUTH.TENANT_RESOLVER` in the global composition root rather than inside the auth module factory. This removes the cross-module composition coupling from the auth module and places it at the proper composition root.

**This is a separate refactor.** Low blast radius but non-trivial. Should not be combined with the incident fix.

---

### Architecture Constraints for Implementation

1. `bootstrap/page.tsx` and the moved `onboarding/actions.ts` MUST both use the single extracted `buildProvisioningInput()` utility — no inline assembly
2. The extracted utility MUST remain server-only — no client-side exposure
3. The moved `onboarding/actions.ts` MUST continue to be imported via `@/modules/provisioning` (public index) not internal sub-paths
4. The redirect loop fix MUST NOT route `TENANT_CONTEXT_REQUIRED` to `/onboarding` — bootstrap is the correct recovery target
5. Do NOT change `ProvisioningInput` shape, `DrizzleProvisioningService`, or any provisioning domain logic
6. Do NOT change `evaluateNodeProvisioningAccess` — it is correctly structured
7. Do NOT move tenant resolvers as part of this incident fix (AR-5 is a separate refactor)
