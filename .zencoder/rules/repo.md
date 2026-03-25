---
description: Repository Information Overview
alwaysApply: true
---

# temp-nextjs-scaffold Information

## Summary

A production-grade **Next.js 16** boilerplate implementing a **Modular Monolith** architecture. Features React 19, TypeScript strict mode, Tailwind CSS 4, Clerk authentication, Sentry error tracking, Upstash rate limiting, and a three-tier testing strategy (Unit / Integration / E2E).

## Structure

- **`src/app/`**: Next.js App Router - routes, layouts, global styles, error boundaries.
- **`src/core/`**: Foundational layer — T3-Env config (`env.ts`), logger, DI container, error contracts.
- **`src/features/`**: Domain-specific feature modules (e.g., `user-management`, `security-showcase`).
- **`src/modules/`**: Infrastructure modules — `auth/` (Clerk), `authorization/` (ABAC).
- **`src/security/`**: Centralized security logic — middleware, RSC guards, outbound filtering, audit actions.
- **`src/shared/`**: Reusable UI components, hooks, utilities, and types.
- **`src/testing/`**: Shared test factories, MSW infrastructure, integration helpers.
- **`src/stories/`**: Storybook component stories.
- **`e2e/`**: Playwright end-to-end test specs.
- **`tests/`**: Global Vitest setup files and polyfills.
- **`scripts/`**: Utility scripts (env setup/check, secret generation, E2E auth check).
- **`docs/`**: Feature documentation, architecture decisions, SDD, usage guides.
- **`.github/workflows/`**: CI/CD pipelines (PR validation, deploy, release, Lighthouse, security scan).

## Language & Runtime

**Language**: TypeScript  
**Version**: TypeScript `^5`, Node.js `24` (`.node-version` / `engines: "node": "24.x"`)  
**Build System**: Next.js 16 Build (Turbopack — default for dev & build)  
**Package Manager**: pnpm (lockfile: `pnpm-lock.yaml`)

## Next.js 16 Key Configuration (`next.config.ts`)

- `cacheComponents: true` — Cache Components model enabled (PPR-compatible).
- `reactCompiler: true` — React Compiler active; avoid manual `useMemo`/`useCallback`/`memo`.
- `experimental.turbopackFileSystemCacheForDev: true` — Filesystem caching for dev restarts.
- Sentry integrated via `withSentryConfig` (source maps, tunnel route in production, Vercel Cron monitors).

## Dependencies

**Main Dependencies**:

- **next**: `16.1.6`
- **react** / **react-dom**: `19.2.4`
- **@clerk/nextjs**: `^6.39.0` — Authentication
- **@sentry/nextjs**: `^10.40.0` — Error tracking & observability
- **@t3-oss/env-nextjs**: `^0.13.10` — Type-safe environment variables
- **@upstash/ratelimit** + **@upstash/redis**: Rate limiting
- **zod**: `^4.3.6` — Schema validation
- **pino** + **pino-logflare**: `^10.3.1` — Structured logging
- **clsx** + **tailwind-merge**: Utility class helpers

**Development Dependencies**:

- **tailwindcss**: `^4.2.1`
- **eslint**: `^9.39.3` (Flat Config)
- **prettier**: `^3.8.1`
- **typescript**: `^5`
- **vitest**: `^4.0.18` + **@vitest/coverage-v8**
- **@playwright/test**: `^1.58.2`
- **storybook**: `^10.2.13` (`@storybook/nextjs-vite`)
- **msw**: `^2.12.10` — API mocking
- **@testing-library/react**: `^16.3.2`
- **husky**: `^9.1.7` + **lint-staged**: `^16.2.7`
- **semantic-release**: `^25.0.3`
- **babel-plugin-react-compiler**: `^1.0.0`
- **skott** + **madge** + **depcheck**: Dependency analysis

## Build & Installation

```bash
pnpm install          # Install dependencies
pnpm env:init         # Initialize .env.local from .env.example
pnpm env:check        # Verify env consistency
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm start            # Production server
pnpm typecheck        # TypeScript check (tsc --noEmit)
pnpm lint             # ESLint (Flat Config)
pnpm commit           # Conventional commits via commitizen
pnpm release          # Semantic release
```

## Main Files & Resources

- **`src/app/page.tsx`**: Homepage entry point.
- **`src/app/layout.tsx`**: Root layout.
- **`src/core/env.ts`**: T3-Env schema — single source of truth for all env vars.
- **`next.config.ts`**: Next.js configuration with Sentry wrapper.
- **`eslint.config.mjs`**: ESLint 9 Flat Config.
- **`tsconfig.json`**: TypeScript strict config with path aliases.
- **`postcss.config.mjs`**: PostCSS / Tailwind CSS 4 config.
- **`src/proxy.ts`**: Node.js runtime request proxy (replaces middleware for Node use cases).
- **`src/instrumentation.ts`** / **`src/instrumentation-client.ts`**: Sentry instrumentation hooks.
- **`.env.example`**: Template with all required environment variables.

## TypeScript Path Aliases

| Alias          | Resolves to      |
| -------------- | ---------------- |
| `@/*`          | `src/*`          |
| `@/features/*` | `src/features/*` |
| `@/shared/*`   | `src/shared/*`   |
| `@/core/*`     | `src/core/*`     |

## Testing

**Frameworks**: Vitest (unit + integration + Storybook), Playwright (E2E)  
**Coverage**: v8 provider, 80% threshold for unit tests (lines/functions/branches/statements)

| Suite       | Config                                    | Pattern                                                | Command                 |
| ----------- | ----------------------------------------- | ------------------------------------------------------ | ----------------------- |
| Unit        | `vitest.unit.config.ts`                   | `src/**/*.test.{ts,tsx}`, `scripts/**/*.test.{ts,tsx}` | `pnpm test`             |
| Integration | `vitest.integration.config.ts`            | `src/**/*.integration.test.{ts,tsx}`                   | `pnpm test:integration` |
| Storybook   | `vitest.config.ts` (project: `storybook`) | `.stories.{ts,tsx}`                                    | `pnpm test:storybook`   |
| E2E         | `playwright.config.ts`                    | `e2e/**/*.spec.ts`                                     | `pnpm e2e`              |
| All Vitest  | `vitest.config.ts`                        | All above                                              | `pnpm test:all`         |

**Test co-location**: Unit tests reside next to source files (e.g., `src/core/env.ts` → `src/core/env.test.ts`).  
**Setup files**: `tests/setup.tsx`, `tests/polyfills.ts`.  
**E2E browsers**: Chromium only (Playwright); base URL `http://localhost:3000`.

## Git Hooks & Quality Gates

- **pre-commit**: `lint-staged` — ESLint fix + Prettier on JS/TS; Prettier on JSON/CSS/MD; `tsc-files` on TS.
- **pre-push**: `pnpm typecheck` → `pnpm skott:check:only` → `pnpm depcheck` → `pnpm madge`.
- **commit-msg**: `commitlint` — enforces Conventional Commits spec.

## CI/CD Workflows (`.github/workflows/`)

- **`pr-validation.yml`**: Runs typecheck, lint, unit tests on every PR.
- **`prod-deploy.yml`** / **`preview-deploy.yml`**: Vercel deployments.
- **`release.yml`**: Semantic release automation.
- **`lighthouse.yml`**: Lighthouse CI performance audits.
- **`deployChromatic.yml`**: Chromatic visual regression tests.
- **`security-scan.yml`**: Security scanning.
- **`e2e-label.yml`**: E2E test label automation.

## Environment Variables (Key Groups)

Managed via `src/core/env.ts` (T3-Env + Zod). Groups:

- **App**: `NODE_ENV`, `NEXT_PUBLIC_APP_URL`
- **Auth (Clerk)**: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, redirect URLs
- **Error Tracking (Sentry)**: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- **Logging**: `LOG_LEVEL`, `LOGFLARE_*`, `PINO_*`
- **Rate Limiting**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `API_RATE_LIMIT_*`
- **Security**: `INTERNAL_API_KEY`, `SECURITY_AUDIT_LOG_ENABLED`, `SECURITY_ALLOWED_OUTBOUND_HOSTS`, CSP allowlists
- **E2E**: `E2E_ENABLED`, `E2E_CLERK_USER_USERNAME`, `E2E_CLERK_USER_PASSWORD`
