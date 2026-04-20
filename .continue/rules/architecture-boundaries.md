# Architecture Boundaries

Use this repository as a modular monolith, not a grab-bag of reusable files.

## Layer Ownership

- `src/app/`: delivery only. Routes, layouts, pages, route glue, error boundaries.
- `src/core/`: contracts, env, logger, DI container, low-level shared foundations.
- `src/features/`: domain-specific feature modules.
- `src/modules/`: infrastructure adapters and provider integration.
- `src/security/`: centralized enforcement, middleware/guards, outbound filtering, audit actions.
- `src/shared/`: reusable UI and domain-agnostic helpers only.

## Dependency Direction

Expected direction:

- `app -> features/modules/security/shared/core`
- `features -> modules/security/shared/core`
- `modules -> shared/core`
- `security -> shared/core`
- `shared -> core`
- `core` must not depend on higher layers outside approved composition-root exceptions.

## Review Rules

- Do not move business logic into `src/shared/*`.
- Do not hide domain rules in `src/app/*` delivery code.
- Do not cross module boundaries just because data or helpers are already available.
- Do not leak provider-specific concepts into core contracts.
- Preserve DI and composition-root discipline.

## Repository-Specific Notes

- Middleware-style request interception lives in `src/proxy.ts`, not `middleware.ts`.
- Treat repository code as the source of truth if docs and code drift.
- Prefer the smallest safe change over architecture churn.

## What Not To Re-Flag

These concerns are already primarily owned by deterministic tooling and should only be raised when a semantic exception matters:

- import-direction drift already caught by `scripts/architecture-lint.sh`
- dependency graph and cycle problems already caught by `skott` and `madge`
- logger import restrictions already caught by `eslint.config.mjs`
