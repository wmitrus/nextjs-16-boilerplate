# Architecture Impact Review

## Change Scope

Two files affected:

1. `newrelic.js` — NR agent config (CommonJS, project root)
2. `src/sentry.server.config.ts` — Sentry server initialization

## Module Boundary Assessment

### `newrelic.js`

- Lives at project root — NR agent config file, read at agent bootstrap
- Not part of any `src/` module boundary
- Change: add `filepath: 'stdout'` to `logging` section
- **No module boundary impact** — this is external SDK configuration

### `src/sentry.server.config.ts`

- Lives outside the modular monolith source tree (root-level Sentry config)
- Imported via `src/instrumentation.ts` (Next.js instrumentation hook)
- Not part of any feature or infrastructure module
- Change: wrap `console.warn` in `NODE_ENV === 'development'` guard
- **No module boundary impact** — change is purely in SDK initialization

## DI Container Assessment

Neither change touches the DI container, `Container`, `getAppContainer()`, or any registered service. No impact.

## Security / Auth Regression Assessment

- No auth, authorization, tenant, or session logic involved
- No trust boundary changes
- No secrets are introduced, moved, or exposed
- New Relic `logging.filepath: 'stdout'` does not change what NR logs — only where agent internal logs go
- Sentry `console.warn` gating does not affect error capture or DSN initialization logic

## Runtime Placement

- Both changes are Node.js runtime only (`NEXT_RUNTIME=nodejs`)
- Neither change affects Edge runtime
- No `export const dynamic` / `export const runtime` concerns (instrumentation is not a route segment)

## Forward Compatibility

- `logging.filepath: 'stdout'` is the correct pattern for containerized/serverless — aligns with future deployment targets
- Gating `console.warn` on `NODE_ENV` is a common, stable pattern with no future compat risk

## Verdict

**Both changes are safe to implement.** No architectural violations, security regressions, or boundary conflicts. Blast radius is minimal — two isolated SDK config files.
