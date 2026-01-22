# Development Standards

## Testing Conventions

- **Co-location**: All unit tests MUST be co-located with their source files.
  - Example: `src/core/env.ts` -> `src/core/env.test.ts`
  - Example: `scripts/setup-env.mjs` -> `scripts/setup-env.test.ts`
- **Naming**: Use `.test.ts` or `.test.tsx` suffix.
- **Root `tests/` directory**: Reserved ONLY for global setup, polyfills, and shared test utilities.

## Environment Management

- Use `src/core/env.ts` (T3-Env) for all environment variable access.
- Always update `.env.example` when adding new variables to the schema.
- Run `pnpm env:check` to verify consistency.

## Build & Quality Gates

- **Pre-push**: Enforces `typecheck`, circular dependency checks (`skott`, `madge`), unused dependency checks (`depcheck`), and environment consistency.
- **Linting**: ESLint 9 with flat config and Prettier integration.
