# Per-Request Container Caching

## Purpose

This repository uses a request-scoped DI container. The goal is to build that container once per React Server Component render pass instead of rebuilding it every time a server path calls `getAppContainer()`.

This is not a data cache and it is not a cross-request cache. It only deduplicates container construction inside one request/render scope.

## Why this exists

Before this change, repeated `getAppContainer()` calls in the same request could rebuild the container and re-run infrastructure setup more than once. That increased overhead and made it harder to reason about request-local behavior.

The current design keeps the public API the same while making repeated calls idempotent inside a single request scope.

## Where it lives

- `src/core/runtime/bootstrap.ts`
- `src/core/runtime/bootstrap.test.ts`
- `src/core/observability/new-relic.ts`

The cache is intentionally implemented in `core/runtime`, not in `shared` and not in route/UI code. Container lifecycle belongs to the composition root.

## Implementation shape

The cache is a module-level `React.cache()` wrapper around container creation.

```typescript
import 'server-only';

import { cache } from 'react';

const getRequestScopedContainer = cache((): Container => {
  const instanceId = crypto.randomUUID();

  const container = withContainerCreationSpan(() =>
    createRequestContainer(buildConfig()),
  );

  recordContainerCreated(instanceId, 'rsc');

  return container;
});

export function getAppContainer(): Container {
  return getRequestScopedContainer();
}
```

## Important details

### Module-level cache only

The cached factory must stay at module scope. If it is moved inside `getAppContainer()`, a fresh cache is created per call and deduplication silently breaks.

### `buildConfig()` stays inside the callback

Config resolution happens inside the cached callback so request-time construction still occurs lazily and the module does not eagerly execute runtime-sensitive setup at import time.

### Public API is unchanged

Callers still use:

```typescript
const container = getAppContainer();
```

That kept the blast radius low across the codebase.

### Child containers still work

`createChild()` continues to resolve through the cached parent container. The cache changes container creation frequency, not container semantics.

## Runtime semantics

### Within one RSC render pass

Multiple `getAppContainer()` calls return the same `Container` instance.

### On a new request

React invalidates the request cache and a new `Container` instance is created.

### On server actions and route handlers

The observability facade supports `server_action` and `route_handler` execution contexts, but the current bootstrap path records creation with `execution.context='rsc'`. That matches the active call path this feature was implemented for.

## What this does not do

- It does not cache repository results.
- It does not memoize feature-flag lookups or user reads.
- It does not persist containers across requests.
- It does not replace server authorization checks.
- It does not belong in client components.

If targeted request-local memoization is later needed for expensive reads, it should be added as explicit helpers rather than hidden inside the container bootstrap path.

## Observability

Container creation is wrapped in a New Relic segment:

- segment name: `di.container.create`
- custom attributes:
  - `container.created=true`
  - `container.instance_id=<uuid>`
  - `request.cache.scope='rsc'`
  - `execution.context='rsc'`

The goal is to measure container creation cost without instrumenting every service resolution.

## Validation coverage

The main unit coverage is in `src/core/runtime/bootstrap.test.ts`:

- MR-1: repeated calls return the same container instance
- MR-2: module reset simulates a new request and returns a new container
- MR-3: child containers resolve through the cached parent

Additional integration tests that import `getAppContainer()` must keep the module server-only and mock `server-only` in Vitest when needed.

## Guardrails

- Keep the cache in `src/core/runtime/bootstrap.ts`.
- Do not move business logic into the cache callback.
- Do not use this as a generic memoization pattern for arbitrary reads.
- Do not import `getAppContainer()` into client code.
- Do not broaden New Relic instrumentation from this path to every DI resolve.
