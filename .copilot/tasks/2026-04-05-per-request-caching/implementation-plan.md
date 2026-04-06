# Implementation Plan: Per-Request DI Container Caching + New Relic Observability

**Task ID**: `2026-04-05-per-request-caching`
**Status**: ✅ Complete — Implemented And Validated
**Date**: 2026-04-05
**Approved by**: User (2026-04-05)

---

## Approved Scope

1. **Layer 1 — React.cache() wrapper** on `getAppContainer()` (primary, approved)
2. **New Relic integration** — Node.js agent setup + targeted custom spans + cache attributes
3. **Layer 2 — deferred** — read-model memoization helpers (`request-memoize.ts`) excluded from this task

---

## Phase 1 — React.cache() Wrapper

### Files Changed

| File                                 | Change Type | Description                                      |
| ------------------------------------ | ----------- | ------------------------------------------------ |
| `src/core/runtime/bootstrap.ts`      | Modify      | Add `cache` import + module-level cached factory |
| `src/core/runtime/bootstrap.test.ts` | Modify      | Add unit tests MR-1, MR-2, MR-3                  |

### Implementation Steps

- [x] **1.1** — In `src/core/runtime/bootstrap.ts`:
  - Add `import { cache } from 'react'` at top-level imports
  - Add `import 'server-only'` (verify not already present — add if missing)
  - Define module-level constant: `const getRequestScopedContainer = cache((): Container => createRequestContainer(buildConfig()))`
  - Replace `getAppContainer()` body with: `return getRequestScopedContainer()`
  - **Critical**: `getRequestScopedContainer` MUST be module-level (not inside `getAppContainer` body)

- [x] **1.2** — In `src/core/runtime/bootstrap.test.ts`, add unit tests:
  - **MR-1**: Same instance returned within one cache scope — two calls to `getAppContainer()` within the same test return `===` same object
  - **MR-2**: Fresh instance after module reset — use `vi.resetModules()` + dynamic import to get two separate module instances; verify their `getAppContainer()` calls return different objects
  - **MR-3**: Child container compatibility — `getAppContainer().createChild()` resolves through to the parent

### Phase 1 Constraints (from `constraints.md`)

- `getRequestScopedContainer` MUST be module-level constant — never inside a function body
- Public `getAppContainer(): Container` signature MUST NOT change
- `buildConfig()` called inside the `cache()` callback
- `server-only` import added as explicit server-only guard

---

## Phase 2 — New Relic Integration

### Background

New Relic is a new dependency. The user is on the free plan. The Node.js agent (v12+) includes the `@newrelic/next` integration automatically — only the `newrelic` package is needed.

**New Relic agent initialization constraint**: The agent requires early process boot. In Next.js, use `instrumentation.ts` `register()` hook with a conditional dynamic import for the Node.js runtime.

### Files Changed / Created

| File                                  | Change Type      | Description                                                            |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `package.json`                        | Modify           | Add `newrelic` as a production dependency                              |
| `newrelic.js`                         | Create (root)    | New Relic agent config file (required by agent)                        |
| `src/core/env.ts`                     | Modify           | Add `NEW_RELIC_LICENSE_KEY`, `NEW_RELIC_APP_NAME`, `NEW_RELIC_ENABLED` |
| `.env.example`                        | Modify           | Add New Relic env vars section                                         |
| `src/instrumentation.ts`              | Modify           | Initialize New Relic agent in `register()` Node.js runtime branch      |
| `src/core/observability/new-relic.ts` | Create           | Provider-isolated NR facade for custom spans and attributes            |
| `src/core/runtime/bootstrap.ts`       | Modify (Phase 2) | Add NR custom spans + cache attributes                                 |

### Implementation Steps

- [x] **2.1** — Install `newrelic` package:

  ```bash
  pnpm add newrelic
  ```

  Verify the package is added to `dependencies` in `package.json` (not `devDependencies`).

- [x] **2.2** — Create `newrelic.js` at repository root:
  - This is the standard New Relic config file (agent reads this at startup)
  - Required config: `app_name`, `license_key`, `logging.level`
  - Use `NEW_RELIC_LICENSE_KEY` and `NEW_RELIC_APP_NAME` from `process.env` directly (env not yet validated at this point)
  - Follow the official New Relic Node.js agent config format
  - Set `enabled: !!process.env.NEW_RELIC_LICENSE_KEY` so the agent is disabled by default when no key is configured

- [x] **2.3** — Add New Relic env vars to `src/core/env.ts`:
  - `NEW_RELIC_LICENSE_KEY`: `z.string().optional()` — server-only
  - `NEW_RELIC_APP_NAME`: `z.string().default('nextjs-16-boilerplate')` — server-only
  - `NEW_RELIC_ENABLED`: `z.preprocess(val => val === 'true' || val === true, z.boolean()).default(false)` — server-only
  - Add these to the `server` section and corresponding `runtimeEnv` mapping

- [x] **2.4** — Add to `.env.example` (new section):

  ```
  # Observability — New Relic APM
  NEW_RELIC_ENABLED=false
  NEW_RELIC_LICENSE_KEY=
  NEW_RELIC_APP_NAME=nextjs-16-boilerplate
  ```

- [x] **2.5** — Modify `src/instrumentation.ts`:
  - In the `process.env.NEXT_RUNTIME === 'nodejs'` branch, add New Relic agent initialization
  - Must be loaded before or alongside Sentry
  - Use dynamic import: `if (process.env.NEW_RELIC_ENABLED === 'true') { require('newrelic'); }`
  - Note: `require()` syntax is intentional here — New Relic agent must be initialized synchronously
  - The agent reads `newrelic.js` config automatically from the project root

- [x] **2.6** — Create `src/core/observability/new-relic.ts` — provider-isolated facade:
  - Purpose: isolate New Relic SDK from calling code; handle agent not configured/loaded
  - Must NOT use `import newrelic from 'newrelic'` at module level (avoids startup crash when NR disabled)
  - Pattern: lazy `require('newrelic')` wrapped in try/catch; no-op if unavailable
  - Exports:
    - `recordContainerCreated(instanceId: string, executionContext: 'rsc' | 'server_action' | 'route_handler'): void`
    - Reuse is represented by the `React.cache()` boundary; no separate reuse hook is currently emitted
    - `withContainerCreationSpan<T>(fn: () => T): T` — wraps `newrelic.startSegment('di.container.create', true, fn)`
  - File must be `'server-only'`

- [x] **2.7** — Modify `src/core/runtime/bootstrap.ts` — add NR observability:
  - Import facade: `import { withContainerCreationSpan, recordContainerCreated, recordContainerReused } from '@/core/observability/new-relic'`
  - Generate a stable `instanceId` per Container (use `crypto.randomUUID()`)
  - Wrap `createRequestContainer(buildConfig())` inside `withContainerCreationSpan()` in the cached factory
  - After creating a container: call `recordContainerCreated(instanceId, 'rsc')`
  - The `React.cache()` mechanism handles reuse — NR attributes are set at creation time only

  **Custom spans to emit** (as per user approval):
  - `di.container.create` — via `withContainerCreationSpan` wrapper

  **Span attributes to set** (not separate spans):
  - `container.created = true|false`
  - `container.instance_id = <uuid>`
  - `request.cache.scope = 'rsc'`
  - `execution.context = 'rsc' | 'server_action' | 'route_handler'`

  **Do NOT add spans for**: each DI resolve, each module registration, each service call.

- [x] **2.8** — Normalize `NEW_RELIC_BROWSER_SNIPPET` in `src/core/observability/new-relic.ts`:
  - Strip optional outer `<script ...>` and `</script>` wrappers defensively.
  - Preserve bare JavaScript snippets unchanged.
  - Keep the helper silent and server-only; do not log snippet content.

- [x] **2.9** — Replace `next/script` browser snippet injection in `src/app/layout.tsx`:
  - Remove `strategy="beforeInteractive"` injection for the New Relic browser snippet.
  - Render the sanitized snippet through a native `<script>` inside the root `<head>`.
  - Keep `getBrowserTimingHeaderSafe()` out of the layout path because of the documented Next.js 16 prerender restriction.

- [x] **2.10** — Add transport-safe browser snippet sourcing:
  - Prefer `NEW_RELIC_BROWSER_SNIPPET_BASE64` over the raw snippet env var.
  - Recover the raw `NEW_RELIC_BROWSER_SNIPPET=` line from `.env.local` / `.env` when local dotenv parsing truncates at `#`.
  - Update env schema and docs so local operator guidance matches the supported runtime behavior.

### Phase 2 Constraints

- New Relic facade in `src/core/observability/` — NOT in `shared/` (business observability, not UI utility)
- Facade must be `server-only`
- Facade must handle NR not installed / not enabled gracefully (no-op when disabled)
- `newrelic.js` at root reads from `process.env` directly (T3-Env not yet available at agent startup)
- Agent initialization in `instrumentation.ts` must be conditional on `NEW_RELIC_ENABLED`
- TypeScript: `newrelic` package provides types — use `import type { NewRelic } from 'newrelic'` pattern if needed
- Do NOT add NR spans to every DI resolve, every service call, every repository method
- Container spans/attributes should be minimal: creation event + instance identity

### Explicitly Rejected New Relic Suggestion Follow-ups

The New Relic UI suggested adding instrumentation for several uninstrumented third-party hosts/services. These are **explicitly rejected for this task**.

| Suggestion                              | Decision              | Rationale                                                                                                                                     |
| --------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.logflare.app`                      | Rejected              | Logflare is an observability sink. Instrumenting it would create low-value observability-on-observability traffic.                            |
| `o4508840267612160.ingest.de.sentry.io` | Rejected              | Sentry ingest is also an observability sink and should not be traced as a business dependency.                                                |
| `api.clerk.com`                         | Rejected              | Clerk remains isolated behind auth/provider boundaries. Do not add raw vendor HTTP instrumentation here.                                      |
| `communal-cub-55514.upstash.io`         | Rejected in this task | Upstash is vendor-owned infrastructure. Only app-level rate-limit boundary spans would be acceptable, and that scope is deferred.             |
| `cdn.growthbook.io`                     | Rejected in this task | GrowthBook traffic could justify targeted feature-flag spans, but broadening instrumentation beyond the approved container scope is deferred. |

Rule for this task: keep instrumentation limited to the approved `di.container.create` span and related container attributes. If future observability work is needed, instrument contract-level or app-level boundaries, not host-level vendor traffic.

---

## Phase 3 — Validation

### Required Validation Steps

- [x] **3.1** — Run `pnpm typecheck` — passed on 2026-04-05
- [x] **3.2** — Run `pnpm lint --fix` — passed with 4 documented pre-existing warnings on 2026-04-05
- [x] **3.3** — Run `pnpm test -- --reporter=verbose src/core/runtime/bootstrap.test.ts` — passed on 2026-04-05
- [x] **3.4** — Run `pnpm test -- --reporter=verbose src/core/` — passed on 2026-04-05
- [x] **3.5** — Verify `newrelic.js` is not accidentally bundled into client-side output (check `next.config.ts` exclusion if needed)

### Optional Validation

- [ ] **OPT-1** — Run integration tests: `pnpm test:integration` — no regressions

---

## Execution Sequence

```
Phase 1 (React.cache):
  1.1 → bootstrap.ts wrapper change
  1.2 → unit tests

Phase 2 (New Relic):
  2.1 → install package
  2.2 → newrelic.js config
  2.3 → env.ts additions
  2.4 → .env.example additions
  2.5 → instrumentation.ts init
  2.6 → observability facade (new-relic.ts)
  2.7 → bootstrap.ts NR spans

Phase 3 (Validation):
  3.1 → typecheck
  3.2 → lint
  3.3 → unit tests for Phase 1
  3.4 → full core test suite
  3.5 → NR bundle check
```

---

## Implementation Agent Reading List

Before implementation, read:

1. `/home/wojtek/projects/nextjs-16-boilerplate/.copilot/tasks/2026-04-05-per-request-caching/feature-intake.md`
2. `/home/wojtek/projects/nextjs-16-boilerplate/.copilot/tasks/2026-04-05-per-request-caching/architecture-review.md`
3. `/home/wojtek/projects/nextjs-16-boilerplate/.copilot/tasks/2026-04-05-per-request-caching/runtime-review.md`
4. `/home/wojtek/projects/nextjs-16-boilerplate/.copilot/tasks/2026-04-05-per-request-caching/constraints.md`
5. `/home/wojtek/projects/nextjs-16-boilerplate/.copilot/tasks/2026-04-05-per-request-caching/validation-strategy.md`
6. This file (`implementation-plan.md`)

---

## Residual Risks

| Risk                                                                                    | Mitigation                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `React.cache()` deduplication silently broken if constant defined in wrong scope        | Enforced by `constraints.md` + unit test MR-1 will catch it                                            |
| New Relic agent crashes on init if license key is malformed                             | `newrelic.js` sets `enabled: !!process.env.NEW_RELIC_LICENSE_KEY`; conditional in `instrumentation.ts` |
| New Relic slows down container creation measurements                                    | Spans are only on container creation (once per request), not on resolves                               |
| `newrelic.js` accidentally committed with real license key                              | `.env.example` pattern; key read from process.env, not hardcoded                                       |
| Layer 2 (read-model helpers) introduced prematurely                                     | Explicitly deferred; not in scope for this task                                                        |
| Final validation evidence captured; lint still emits 4 documented pre-existing warnings | See `validation-report.md` for exact commands and results                                              |
