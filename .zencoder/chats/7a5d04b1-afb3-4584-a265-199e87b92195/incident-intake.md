# Incident Intake — Feature Flags Security Audit

## Session Type

Structured security review of a completed feature implementation.  
Not a reactive incident — this is a proactive audit of the feature-flags system delivered in case `3344a061-a328-46f4-b51b-c72a67b7df06`.

## Incident Description

The feature-flags system (Steps 1–21 of `3344a061`) was implemented without a Security & Auth agent review pass. The implementation spans:

- Three feature-flag adapters: `StaticFeatureFlagService`, `DrizzleFeatureFlagService`, `GrowthBookFeatureFlagService`
- A resilient wrapper: `ResilientFeatureFlagService`
- A provider factory: `src/modules/feature-flags/factory.ts`
- DI bootstrap wiring: `src/core/runtime/bootstrap.ts`
- Migration scripts: `scripts/flags/export.ts`, `scripts/flags/import.ts`, `scripts/flags/migrate.ts`
- A public-facing demo page: `src/app/feature-flags-demo/page.tsx`
- Drizzle schema: `src/modules/feature-flags/infrastructure/drizzle/schema.ts`
- DB integration tests, MSW handlers, E2E spec

## Suspected Severity

**MAJOR** — multiple security rule violations confirmed across the feature. At least two violations match repository-mandated hard rules (CWE-22 and CWE-918). No confirmed authorization bypass affecting real user data at runtime, but structural cross-tenant contamination risk exists in the GrowthBook adapter.

## Affected Surface

| Area                                                  | Concern                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GrowthBookFeatureFlagService.ts`                     | Shared mutable singleton with per-request attributes — cross-tenant contamination risk       |
| `scripts/flags/export.ts`                             | CWE-22: `--out` CLI arg → `fs.writeFileSync` without path confinement                        |
| `scripts/flags/import.ts`                             | CWE-22: `--file` CLI arg → `fs.readFileSync` without path confinement                        |
| `src/core/env.ts` + `GrowthBookFeatureFlagService.ts` | CWE-918: `GROWTHBOOK_API_HOST` env-var URL → HTTP client without point-of-use allowlist      |
| `route-policy.ts`                                     | `/feature-flags-demo` missing from `PUBLIC_ROUTE_PREFIXES` — intent vs. enforcement mismatch |
| `ResilientFeatureFlagService.ts`                      | Raw `error` object logged — potential sensitive DB info exposure                             |
| `scripts/flags/import.ts` + `migrate.ts`              | `JSON.parse(raw) as FlagsFile` without runtime schema validation                             |
| `factory.ts` default fallback                         | Uses `console.warn` instead of structured logger                                             |

## Known Symptoms

- GrowthBook adapter caches a `GrowthBook` instance per `clientKey` and calls `gb.setAttributes(userContext)` on the singleton per request — in multi-tenant concurrent scenarios this is a mutable shared state risk.
- `scripts/flags/export.ts` accepts `--out=<any-path>` and writes there without confinement check — violates AGENTS.md mandatory hard rule.
- `scripts/flags/import.ts` accepts `--file=<any-path>` and reads from there without confinement check.
- `GROWTHBOOK_API_HOST` is validated only by `z.url()` (format check) but is passed directly to the GrowthBook SDK which makes outbound HTTP calls — no point-of-use hostname/protocol allowlist.
- `/feature-flags-demo` is NOT in `PUBLIC_ROUTE_PREFIXES`; the proxy's `rejectUnauthenticatedPrivateRoute()` redirects unauthenticated users to `/sign-in` for this route in production. The E2E spec assumes public access and would fail against a real production-config server.

## Known Constraints

- The feature-flags system is in production-grade boilerplate — it must follow all repository security rules without exception.
- Scripts in `scripts/` are explicitly in scope for AGENTS.md security rules.
- `GROWTHBOOK_API_HOST` is server-side only (not in client schema) — SSRF risk is operator-level, not end-user-level.
- The `GrowthBook` SDK manages HTTP internally; the adapter does not call `fetch()` directly but passes `apiHost` to the SDK constructor.

## Initial Unknowns (resolved during review)

| Unknown                                               | Resolution                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Is `GrowthBook.setAttributes()` synchronous or async? | It appears synchronous in SDK v1.x but the pattern is still architecturally dangerous under concurrent load |
| Is `/feature-flags-demo` E2E-bypassed?                | No — `isE2eRoute` only covers `/e2e-error` and `/users` paths                                               |
| Does the E2E spec actually pass in production config? | No — it would fail because the route is not public                                                          |

## Source of Findings

Proactive code review initiated by operator request.  
Review source: `.zencoder/chats/3344a061-a328-46f4-b51b-c72a67b7df06/` — all plan steps, implementation files, and documentation.
