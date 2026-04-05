# Feature Constraints: Per-Request DI Container Caching

**Task ID**: `2026-04-05-per-request-caching`
**Status**: ✅ Complete
**Date**: 2026-04-05
**Sources**: `architecture-review.md`, `runtime-review.md`, `feature-intake.md`, user Q&A

---

## Task

Wrap `getAppContainer()` with `React.cache()` to memoize the Container factory at request scope for RSC render passes.

---

## Scope

### In Scope

- Modify `src/core/runtime/bootstrap.ts` to use `React.cache()` internally
- Optionally create `src/core/runtime/request-memoize.ts` for Layer 2 read-model cache helpers
- Write unit tests for the caching invariant
- Write or update integration test confirming shared container per render pass
- Typecheck and lint compliance

### Out of Scope

- `src/core/container/index.ts` — `Container` class must not change
- `src/core/runtime/edge.ts` — edge path must not change
- `src/proxy.ts` — middleware path must not change
- All files in `src/app/*` — no call-site changes required
- All files in `src/modules/*` — no module registration changes
- No new demo or showcase page
- No Playwright E2E spec (no demo page obligation)
- No `AsyncLocalStorage` introduction
- No cross-request or cross-action container sharing

---

## Architecture Constraints

1. **Module boundary**: Change is confined to `src/core/runtime/bootstrap.ts` (and optionally the new `request-memoize.ts`). No other layer may be modified.
2. **Dependency direction**: `bootstrap.ts` may depend on `react` (framework) — this is already established across the codebase. This does not violate `core → app/features/modules` prohibition.
3. **Composition root discipline**: The `React.cache()` wrapper belongs at the composition root level (`bootstrap.ts`) — not inside individual RSC pages or layouts.
4. **Module-level constant**: `getRequestScopedContainer` MUST be defined as a module-level constant — not inside a function body. If defined inside `getAppContainer()`, each call creates a new `cache()` scope and deduplication fails entirely.
5. **`Container` class unchanged**: The `Container` implementation in `src/core/container/index.ts` must not be modified.
6. **Public API preserved**: `getAppContainer(): Container` signature must not change. No call sites should require updates.
7. **Child containers**: `getAppContainer().createChild()` must continue to work correctly — the child is created from the cached parent, not cached itself.

---

## Security / Auth Constraints

1. **No auth boundary changes**: The memoization layer is transparent to auth logic. Identity resolution, tenant resolution, and authorization remain inside service contracts.
2. **No tenant cross-contamination risk**: `React.cache()` clears between requests — no risk of Container A from request N being served to request N+1.
3. **No secrets in cache**: The Container holds service registrations (factory wrappers, constructor instances), not raw secret values. No sensitive data caching concern.
4. **No trust boundary changes**: The change does not affect what is trusted or how identity is established.

---

## Runtime Constraints

1. **`import { cache } from 'react'`** must be a top-level import in `bootstrap.ts`.
2. **`getRequestScopedContainer` must be module-level** (not function-scoped) so that the same `cache()` boundary is shared by all callers.
3. **`buildConfig()` must be called inside the `cache()` callback** — lazy config resolution avoids issues with env validation at module load time.
4. **`connection()` call requirement is unchanged**: Any async RSC calling `getAppContainer()` must still call `await connection()` (or `headers()` / `cookies()`) before the call. The memoization layer does not satisfy this requirement.
5. **Server-only enforcement**: `bootstrap.ts` must remain server-only. Recommend adding `import 'server-only'` as an explicit guard if not already present. This prevents accidental client bundle inclusion.
6. **Edge runtime path unchanged**: `src/core/runtime/edge.ts` and `createEdgeRequestContainer` must not be modified.
7. **Route handler behaviour**: Route handlers calling `getAppContainer()` will continue to get per-handler-invocation containers (React.cache() provides handler-level deduplication at most). This is acceptable — no regression.

---

## Validation Constraints

- **Minimum required**: Unit test asserting that two calls to `getAppContainer()` within the same simulated React cache context return the same Container instance.
- **Minimum required**: Typecheck passes (`pnpm typecheck`).
- **Minimum required**: Lint passes (`pnpm lint --fix`).
- **Optional**: Integration test exercising the full RSC render path through Next.js test infrastructure.
- **Not required**: Playwright E2E (no user-visible behaviour change, no demo page).
- **Not required**: New Storybook stories.
- **Not required**: Additional MSW handlers.

---

## Explicitly Allowed Changes

| File                                                             | What is allowed                                                                                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/runtime/bootstrap.ts`                                  | Add `import { cache } from 'react'`, add `import 'server-only'`, add module-level `getRequestScopedContainer = cache(...)`, change `getAppContainer()` body to call the cached factory |
| `src/core/runtime/request-memoize.ts` (new, optional)            | Create with `cache()`-wrapped read helpers for identity, tenant, feature flags, provisioning                                                                                           |
| `src/core/runtime/bootstrap.test.ts`                             | Add/update tests for the caching invariant                                                                                                                                             |
| `src/core/runtime/bootstrap.integration.test.ts` (new, optional) | Add integration test for shared container behaviour                                                                                                                                    |

---

## Explicitly Forbidden Changes

| What                                                        | Why                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Changing `Container` class                                  | Out of scope — high blast radius                                 |
| Changing `getAppContainer()` public signature               | Would break all call sites                                       |
| Adding `AsyncLocalStorage`                                  | Not required — over-engineering for current needs                |
| Sharing Container across Server Action invocations          | Incorrect semantics — mutations must be isolated                 |
| Sharing Container across separate HTTP requests             | Incorrect semantics — would be a security and correctness defect |
| Modifying `src/core/runtime/edge.ts`                        | Separate path, separate concerns                                 |
| Adding a demo or showcase page                              | Explicitly excluded by design decision                           |
| Defining the cached factory inside `getAppContainer()` body | Would break deduplication — each call creates new cache scope    |
| Importing `bootstrap.ts` in client components               | Server-only constraint                                           |

---

## Protected Invariants

1. `getAppContainer()` returns a `Container` instance with all standard modules registered (auth, authorization, feature-flags, provisioning, infrastructure DB).
2. `getAppContainer().createChild()` returns a child Container that falls through to the parent for shared service resolution.
3. Process-level infrastructure (`dbRuntime`) remains cached in `globalThis` — unaffected by this change.
4. Server Actions calling `getAppContainer()` receive a fresh-per-invocation Container (not shared with the RSC render tree).
5. The Edge runtime (`src/proxy.ts` → `createEdgeRequestContainer`) is completely unaffected.
6. All existing unit and integration tests continue to pass without modification.

---

## Open Questions / Blocks

None. All design decisions resolved. Implementation blocked only by user design approval.
