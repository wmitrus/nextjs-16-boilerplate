# Project-Wide Implementation Anti-Patterns

Project-wide coding and implementation anti-patterns that repeatedly caused drift,
mass cleanup work, weak validation, or scanner churn in this repository.

Use this document for:

- features
- fixes
- refactors
- scripts and tooling changes
- test changes that affect repository guardrails

Do not treat this file as style guidance. These are repository-level anti-patterns
with real maintenance cost or production risk.

Repository code remains the source of truth. This document captures the durable
lessons that should prevent reintroducing the same classes of changes.

---

## 1. Boundary Anti-Patterns

### 1.1 Business Logic In Delivery Or Shared Layers

Do not:

- move business rules into `src/shared/*`
- hide domain behavior in `src/app/*` layouts, pages, or route glue code
- treat reusable UI or utility modules as an overflow area for domain logic

Why this is banned:

- it breaks modular-monolith ownership
- it makes later policy hardening and tenancy isolation expensive
- it spreads behavior into layers that should only deliver or compose

Preferred pattern:

- keep business logic in the owning feature/module/security layer
- keep `shared/*` reusable and domain-agnostic
- keep `app/*` as delivery and orchestration only

### 1.2 Provider Shapes Leaking Into Core Contracts

Do not:

- bake Clerk-specific, Sentry-specific, or vendor-specific fields directly into core contracts
- let adapter response shapes become business truth outside the adapter boundary

Why this is banned:

- provider replacement becomes expensive
- domain logic starts depending on infrastructure details

Preferred pattern:

- translate vendor shapes at the boundary
- keep core and domain contracts provider-neutral

### 1.3 Hidden Cross-Module Convenience Imports

Do not:

- import across module boundaries because "the code is already there"
- bypass the owning module just because the data sits in the same DB

Why this is banned:

- it creates silent dependency direction drift
- it turns cleanup into repository-wide surgery later

Preferred pattern:

- route access through the owning module contract or repository boundary

---

## 2. Runtime And Framework Anti-Patterns

### 2.1 Server/Client Runtime Confusion

Do not:

- move server-only code into client components for convenience
- import server logger or server-only helpers into client or UI modules
- ignore Edge vs Node runtime placement when touching route handlers or proxy logic

Why this is banned:

- it creates runtime-only failures
- it leaks server concerns into client bundles

Preferred pattern:

- keep runtime-specific code in the correct boundary
- preserve repository import rules for logger and runtime-specific helpers

### 2.2 Static Prerender Assumptions In Request-Time Code

Do not:

- call request-sensitive helpers from RSC code without first satisfying Next.js 16 request-time constraints
- assume build-time-safe code when helpers indirectly touch timestamps, logging, cookies, or headers

Why this is banned:

- this repository already hit Next.js 16 prerender/runtime failures caused by request-time behavior leaking into static execution

Preferred pattern:

- use the established runtime-safe patterns documented in `AGENTS.md`
- make request-time boundaries explicit before request-sensitive helper calls

### 2.3 Cache-Blind Sensitive Data Handling

Do not:

- ignore cache behavior for user-specific, auth-specific, or tenant-specific data
- treat a working happy-path render as proof that cache semantics are safe

Preferred pattern:

- reason explicitly about cache and revalidation whenever data scope is user, org, tenant, or permission dependent

---

## 3. Trust And Security Anti-Patterns

### 3.1 UI-Only Authentication Or Authorization Enforcement

Do not:

- rely on UI checks as the only gate for protected behavior
- use middleware/proxy as the only protection for sensitive operations

Preferred pattern:

- enforce authorization server-side in the owning boundary
- treat UI checks as presentation only

### 3.2 Unsanitized Redirect And Lookup Flows

Do not:

- forward redirect-style params without sanitization
- read user-controlled object keys after only a `key in object` check

Preferred pattern:

- use `sanitizeRedirectUrl()` for forwarded redirect params
- use `Object.hasOwn`, null-prototype records, or `Map` for guarded lookups

### 3.3 Helper-Sink Trust Gaps

Do not:

- rely only on upstream validation for helpers that eventually reach `fs.*` or `fetch()`
- assume CLI allowlists remove the need for sink-side guards

Preferred pattern:

- validate at intake and again at the helper sink when the helper performs file or network access

---

## 4. Implementation Shape Anti-Patterns

### 4.1 Dynamic Bracket Dispatch

Do not write:

```typescript
obj[dynamicKey]();
```

Why this is banned:

- poor readability
- weak local review signal
- repeated Codacy churn

Preferred pattern:

- explicit `switch`
- `Record<AllowedKeys, fn>` dispatch map

### 4.2 Repeated Dynamic Object Mutation Chains

Do not write repeated mutation flows like:

```typescript
result[key] = value;
errors[field] = messages;
```

when keys are dynamic or derived in runtime helpers.

Why this is banned:

- it caused repeated `src/**` mass cleanup work
- it obscures the allowed key flow

Preferred pattern:

- `Object.entries()` / `Object.fromEntries()`
- `Map`
- explicit helper functions or `switch`

### 4.3 Open-Coded Script File Access

Do not repeat raw `fs.*` access across `scripts/**` and `e2e/**` when the same access shape already exists elsewhere.

Why this is banned:

- it recreates path-safety review churn
- it forces repeated scanner suppressions and one-off comments

Preferred pattern:

- use shared sink-confined fs helper wrappers
- keep narrow lint exceptions only inside those reviewed helper modules, not at call sites

### 4.4 Dynamic `process.env[key]` Access In Scripts

Do not normalize arbitrary env lookup through unchecked `process.env[key]` access.

Preferred pattern:

- use allowlisted helpers
- use explicit env-name comparisons when the lookup surface is small

### 4.5 Test Mocks That Hide Real Risk Surfaces

Do not:

- over-mock DB-backed adapters when the failure mode is schema or integration sensitive
- write DI mocks as `if (token === SYMBOL)` chains

Preferred pattern:

- add `*.db.test.ts` for Drizzle adapters
- use `Map<symbol, unknown>` for DI token resolution in tests

---

## 5. Change Management Anti-Patterns

### 5.1 Broad Refactor Hidden Inside Behavior Work

Do not:

- mix risky behavior changes with unrelated cleanup without naming it
- hide architectural movement inside a "small" patch

Preferred pattern:

- keep the diff low-blast-radius
- separate cleanup from behavior change when practical

### 5.2 Validation As An Afterthought

Do not:

- skip targeted validation because the change "looks mechanical"
- widen test surface without naming the risk being covered
- end a major implementation phase without repo-wide `pnpm lint --fix` and `pnpm typecheck`

Preferred pattern:

- focused validation during the phase
- repo-wide `pnpm lint --fix` and `pnpm typecheck` before phase close

### 5.3 Artifact Drift During Multi-Step Work

Do not:

- let `plan.md`, `implementation-plan.md`, or summary artifacts lag behind implementation reality

Preferred pattern:

- update task artifacts when a durable decision or phase state changes

---

## 6. How To Use This Document

For implementation, refactor, and remediation work:

1. Read this file before code changes.
2. Check whether the requested change naturally pushes toward any banned shape above.
3. If yes, choose the preferred pattern first instead of patching the anti-pattern and planning a cleanup later.
4. When a new recurring anti-pattern is discovered, update this document and propagate the rule to the instruction surfaces listed in `AGENTS.md`.

If a future task reveals another mass-fix class, add it here instead of relying on chat memory.
