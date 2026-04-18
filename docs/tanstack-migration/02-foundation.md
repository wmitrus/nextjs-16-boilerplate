# Phase 1: Foundation – Scaffold, Vite Config, Tooling, Env

## Objective

Bootstrap the TanStack Start project skeleton with all tooling configured correctly before any feature implementation begins. This phase has no business logic – it only establishes the build, runtime, and developer experience foundation.

**Prerequisite for all other phases.**

---

## What this phase covers

1. Project scaffold and directory structure
2. `package.json` – dependencies
3. `vite.config.ts` – build configuration with dual deployment target
4. `tsconfig.json` – TypeScript strict config
5. `postcss.config.ts` – Tailwind CSS 4
6. `eslint.config.mjs` – ESLint flat config
7. `.prettierrc.json` – Prettier config
8. `commitlint.config.mjs` – Conventional Commits
9. `.releaserc.json` – Semantic release
10. Git hooks (husky + lint-staged)
11. Entry points: `src/app/routes/__root.tsx`, `src/app/client.tsx`, `src/app/server.tsx`
12. `AGENTS.md` – updated agent context for TanStack Start

---

## Package Dependencies

### Runtime dependencies

```json
{
  "@tanstack/react-start": "^1",
  "@tanstack/react-router": "^1",
  "@tanstack/react-query": "^5",
  "better-auth": "^1.5.6",
  "@sentry/tanstackstart-react": "^10.45.0",
  "@t3-oss/env-core": "^0.13.0",
  "@upstash/ratelimit": "^2",
  "@upstash/redis": "^1",
  "drizzle-orm": "^0.44",
  "pino": "^9",
  "zod": "^4",
  "clsx": "^2",
  "tailwind-merge": "^2",
  "react": "^19",
  "react-dom": "^19"
}
```

### Dev dependencies

```json
{
  "@tanstack/router-devtools": "^1",
  "vite": "^6",
  "vite-tsconfig-paths": "^5",
  "@vitejs/plugin-react": "^4",
  "tailwindcss": "^4",
  "@tailwindcss/vite": "^4",
  "typescript": "^5",
  "vitest": "^4",
  "@vitest/coverage-v8": "^4",
  "@testing-library/react": "^16",
  "@testing-library/user-event": "^14",
  "msw": "^2",
  "@playwright/test": "^1",
  "@storybook/react-vite": "^10",
  "drizzle-kit": "^0.30",
  "@electric-sql/pglite": "^0.3",
  "pino-logflare": "^0.4",
  "eslint": "^9",
  "@eslint/js": "^9",
  "typescript-eslint": "^8",
  "prettier": "^3",
  "husky": "^9",
  "lint-staged": "^16",
  "@commitlint/cli": "^19",
  "@commitlint/config-conventional": "^19",
  "commitizen": "^4",
  "semantic-release": "^25",
  "skott": "^0.35",
  "madge": "^8",
  "depcheck": "^1",
  "@sentry/vite-plugin": "^3"
}
```

**Removed from Next.js boilerplate**:

- `next` – replaced by `@tanstack/react-start`
- `@clerk/nextjs` – replaced by `better-auth`
- `@sentry/nextjs` – replaced by `@sentry/tanstackstart-react`
- `@t3-oss/env-nextjs` – replaced by `@t3-oss/env-core`
- `babel-plugin-react-compiler` – React Compiler in Vite uses different approach

---

## `vite.config.ts`

This is the central configuration replacing `next.config.ts`.

```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const deployTarget =
  process.env.DEPLOY_TARGET === 'vercel' ? 'vercel' : 'node-server';

export default defineConfig({
  plugins: [
    tanstackStart({
      target: deployTarget,
    }),
    tsConfigPaths(),
    tailwindcss(),
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              filesToDeleteAfterUpload: ['**/*.js.map'],
            },
          }),
        ]
      : []),
  ],
  build: {
    sourcemap: !!process.env.SENTRY_AUTH_TOKEN,
  },
});
```

**Deployment switch**: Set `DEPLOY_TARGET=vercel` in your environment to build for Vercel. Default is `node-server`.

**No separate Turbopack** – Vite is the single build tool for dev and production. No `TURBOPACK_*` env vars needed.

---

## `tsconfig.json`

Minimal changes from Next.js boilerplate. Key adjustments:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/features/*": ["src/features/*"],
      "@/shared/*": ["src/shared/*"],
      "@/core/*": ["src/core/*"]
    }
  },
  "include": ["src", "tests", "e2e", "scripts"]
}
```

**Removed from Next.js boilerplate**: `"plugins": [{ "name": "next" }]`, `"next-env.d.ts"` reference.

**Same**: Path aliases (`@/*`, `@/features/*`, `@/shared/*`, `@/core/*`), strict mode, `noUncheckedIndexedAccess`.

---

## Entry Points

TanStack Start requires explicit server and client entry points (unlike Next.js which auto-generates them).

### `src/app/server.tsx` (SSR entry)

```tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { createRouter } from './router';

export default createStartHandler({
  createRouter,
})(defaultStreamHandler);
```

### `src/app/client.tsx` (hydration entry)

```tsx
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start';
import { createRouter } from './router';

const router = createRouter();

hydrateRoot(document, <StartClient router={router} />);
```

### `src/app/router.tsx` (shared router factory)

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routerWithQueryClient } from '@tanstack/react-router-with-query';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
      },
    },
  });

  const router = routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      context: {
        queryClient,
      },
      defaultPreload: 'intent',
      defaultPreloadStaleTime: 0,
    }),
    queryClient,
  );

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

---

## Root Route and Layout

### `src/app/routes/__root.tsx`

```tsx
import {
  createRootRouteWithContext,
  Outlet,
  ScrollRestoration,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { RootLayout } from '@/app/components/layout/RootLayout';
import { ClientErrorBoundary } from '@/shared/components/error/client-error-boundary';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: ({ error }) => <ClientErrorBoundary error={error} />,
});

function RootComponent() {
  return (
    <RootLayout>
      <ScrollRestoration />
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools />
          <ReactQueryDevtools />
        </>
      )}
    </RootLayout>
  );
}
```

---

## Global Middleware Registration

```ts
// src/app/global-middleware.ts
import { registerGlobalMiddleware } from '@tanstack/react-start';
import {
  loggingMiddleware,
  headersMiddleware,
  rateLimitMiddleware,
  internalApiGuardMiddleware,
} from '@/security/middleware/request';

registerGlobalMiddleware({
  middleware: [
    loggingMiddleware,
    headersMiddleware,
    rateLimitMiddleware,
    internalApiGuardMiddleware,
  ],
});
```

This file is imported at the server entry point to ensure global middleware runs on all requests.

---

## Git Hooks (husky + lint-staged)

### `pre-commit` – lint-staged

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,css,md}": ["prettier --write"]
}
```

TypeScript type-checking via `tsc-files` on staged files only.

### `pre-push`

```bash
pnpm typecheck && pnpm skott:check:only && pnpm depcheck && pnpm madge
```

Same gates as Next.js boilerplate.

### `commit-msg`

```bash
commitlint --edit $1
```

---

## `package.json` Scripts

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs",
    "start:vercel": "vercel dev",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "test": "vitest run --config vitest.unit.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:storybook": "vitest run --config vitest.config.ts --project storybook",
    "test:all": "vitest run --config vitest.config.ts",
    "test:coverage": "vitest run --config vitest.unit.config.ts --coverage",
    "e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:pglite:studio": "drizzle-kit studio",
    "env:init": "node scripts/env-init.mjs",
    "env:check": "node scripts/env-check.mjs",
    "storybook": "storybook dev -p 6006",
    "build:storybook": "storybook build",
    "commit": "cz",
    "release": "semantic-release",
    "skott:check:only": "skott --no-circular --from src/app/server.tsx",
    "madge": "madge --circular --extensions ts,tsx src/",
    "depcheck": "depcheck"
  }
}
```

**Removed**: `pnpm start` uses Node output directly. No separate Next.js server command.

---

## `.env.example`

Updated for Vite prefix:

```bash
# App
NODE_ENV=development
VITE_APP_URL=http://localhost:3000
DEPLOY_TARGET=node-server

# Auth (Better Auth)
BETTER_AUTH_SECRET=your-secret-min-32-chars
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# Error Tracking
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
VITE_SENTRY_DSN=

# Logging
LOG_LEVEL=info
VITE_LOG_LEVEL=info
LOGFLARE_API_KEY=
LOGFLARE_SOURCE_TOKEN=
LOGFLARE_SOURCE_NAME=
LOGFLARE_SERVER_ENABLED=false
VITE_LOGFLARE_BROWSER_ENABLED=false

# Rate Limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
API_RATE_LIMIT_REQUESTS=10
API_RATE_LIMIT_WINDOW=60 s

# Security
INTERNAL_API_KEY=
SECURITY_AUDIT_LOG_ENABLED=true
SECURITY_ALLOWED_OUTBOUND_HOSTS=api.example.com

# DB
DB_DRIVER=pglite
DB_PROVIDER=drizzle

# Tenancy
TENANCY_MODE=single
DEFAULT_TENANT_ID=

# Feature Flags
FREE_TIER_MAX_USERS=5

# E2E
E2E_ENABLED=false
E2E_USER_USERNAME=
E2E_USER_PASSWORD=
```

---

## What Changes vs Next.js Boilerplate

| File                            | Change                                                            |
| ------------------------------- | ----------------------------------------------------------------- |
| `next.config.ts`                | **Deleted** – replaced by `vite.config.ts`                        |
| `src/middleware.ts`             | **Deleted** – replaced by `createMiddleware()` in `src/security/` |
| `src/proxy.ts`                  | **Deleted** – replaced by request middleware                      |
| `src/instrumentation.ts`        | **Deleted** – Sentry init moves to `src/app/server.tsx`           |
| `src/instrumentation-client.ts` | **Deleted** – Sentry init moves to `src/app/client.tsx`           |
| `vite.config.ts`                | **New**                                                           |
| `src/app/server.tsx`            | **New**                                                           |
| `src/app/client.tsx`            | **New**                                                           |
| `src/app/router.tsx`            | **New**                                                           |
| `src/app/global-middleware.ts`  | **New**                                                           |
| `.env.example`                  | Updated (`NEXT_PUBLIC_` → `VITE_`, Clerk → Better Auth)           |
| `tsconfig.json`                 | Minor: remove Next.js plugin, keep all aliases                    |

---

## Risks

| Risk                                                                                    | Severity | Mitigation                                                      |
| --------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| Vite + TanStack Start config changes between RC versions                                | MINOR    | Pin versions, monitor changelog                                 |
| `routeTree.gen.ts` auto-generation must be in `.gitignore` or committed (team decision) | MINOR    | Follow TanStack Router docs – gen file committed is recommended |
| `tsc-files` pre-commit hook slower on large changesets                                  | MINOR    | Acceptable, same as Next.js boilerplate                         |

---

## Validation

Phase 1 is complete when:

- [ ] `pnpm dev` starts TanStack Start dev server
- [ ] `pnpm build` produces output in `.output/`
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes
- [ ] Root route renders (basic shell, no auth yet)
- [ ] Global middleware registration file exists
- [ ] `pnpm test` runs (no tests yet, exits clean)
