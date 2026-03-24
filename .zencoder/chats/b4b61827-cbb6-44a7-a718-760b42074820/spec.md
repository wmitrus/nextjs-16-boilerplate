# TanStack Start Boilerplate – Technical Specification

## 1. Technical Context

| Item             | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Framework        | `@tanstack/react-start@^1` (v1 RC, latest = 1.167.3) |
| Router           | TanStack Router (bundled)                            |
| Build            | Vite + Vinxi                                         |
| Language         | TypeScript strict                                    |
| Runtime          | Node.js 24 (same as Next.js boilerplate)             |
| Package manager  | pnpm                                                 |
| ORM              | Drizzle ORM (reused)                                 |
| Auth             | Better Auth `^1.5.6`                                 |
| Error tracking   | `@sentry/tanstackstart-react@^10.45.0`               |
| Rate limiting    | Upstash Redis (reused, HTTP SDK)                     |
| Logging          | Pino (reused, simplified – no edge variant)          |
| CSS              | Tailwind CSS 4 (reused)                              |
| Env config       | `@t3-oss/env-core` (replaced `@t3-oss/env-nextjs`)   |
| Testing unit/int | Vitest + RTL + MSW (reused, adjusted setup)          |
| Testing e2e      | Playwright (reused)                                  |
| Storybook        | `@storybook/react-vite`                              |
| Deployment       | Vercel + Node.js (config-only switch)                |

---

## 2. Architecture Approach

### 2.1 Preserved from Next.js boilerplate

All domain/business concepts are preserved. Only the delivery and framework integration layers change.

**Fully reused (zero changes):**

- `src/core/container/` – DI container class (framework-agnostic)
- `src/core/contracts/` – All contracts (authorization, identity, tenancy, repositories, etc.)
- `src/modules/authorization/` – Domain logic (PolicyEngine, AuthorizationService, conditions)
- `src/modules/provisioning/domain/` – Provisioning domain logic
- `src/modules/billing/domain/` – Billing domain (if present)
- `src/modules/*/infrastructure/drizzle/` – Drizzle repositories (framework-agnostic)
- `src/core/db/` – DB layer (drivers, migrations, schema)
- `src/shared/lib/rate-limit/` – Rate limit logic (HTTP SDK)
- `src/shared/lib/api/` – API response helpers (framework-agnostic parts)
- `src/shared/utils/` – Utility functions (cn, etc.)

**Significantly adapted:**

- `src/core/env.ts` – `@t3-oss/env-nextjs` → `@t3-oss/env-core`, `NEXT_PUBLIC_` → `VITE_`
- `src/core/logger/` – Simplified: server + browser only, no edge variant
- `src/core/runtime/` – Bootstrap/composition root adapted for TanStack Start (no edge root)
- `src/modules/auth/` – Clerk adapters → Better Auth adapters
- `src/modules/provisioning/infrastructure/` – Simplified (no external identity mapping)
- `src/security/` – middleware redesigned around `createMiddleware()`
- `src/testing/infrastructure/` – Remove `next/*` mocks, add TanStack Start mocks

**New / replaced:**

- `src/app/` – TanStack Router route files replace Next.js App Router
- `src/proxy.ts` – DELETED. Replaced by `createMiddleware()` request middleware
- `src/instrumentation.ts` / `src/instrumentation-client.ts` – Replaced by Sentry TanStack Start SDK hooks
- `vite.config.ts` – New (replaces `next.config.ts`)
- `app.config.ts` or inline in `vite.config.ts` – TanStack Start config

### 2.2 Layer model (preserved)

```
src/app/          → delivery layer (TanStack Router routes, layouts)
src/core/         → contracts, DI container, env, logger, stable foundation
src/features/     → product-facing composition slices
src/modules/      → isolated business/integration modules
src/security/     → centralized security middleware and enforcement
src/shared/       → neutral reusable building blocks
src/testing/      → shared testing infrastructure
```

### 2.3 Dependency direction (preserved)

```
app → features/modules/security/shared/core
features → modules/security/shared/core
modules → shared/core
security → shared/core
core → (no upward dependencies)
```

---

## 3. File Structure

### 3.1 Root files

```
tanstack-start-boilerplate/
├── vite.config.ts              # TanStack Start + Vite config (replaces next.config.ts)
├── tsconfig.json               # TypeScript strict (same)
├── package.json
├── pnpm-lock.yaml
├── .env.example                # Updated for VITE_ prefix
├── postcss.config.mjs          # Tailwind CSS 4 (same)
├── playwright.config.ts        # E2E (same)
├── vitest.config.ts            # Combined vitest config
├── vitest.unit.config.ts
├── vitest.integration.config.ts
├── eslint.config.mjs           # ESLint flat config (same)
├── .prettierrc.json            # Same
├── commitlint.config.mjs       # Same
├── .releaserc.json             # Same
├── AGENTS.md                   # Updated for TanStack Start
└── ...
```

### 3.2 `src/` structure

```
src/
├── app/                        # TanStack Router delivery layer
│   ├── routes/                 # File-based routes (TanStack Router convention)
│   │   ├── __root.tsx          # Root route (equivalent to app/layout.tsx)
│   │   ├── index.tsx           # Home page (/)
│   │   ├── _authed/            # Protected route group (requires auth)
│   │   │   ├── route.tsx       # Protected layout (beforeLoad auth gate)
│   │   │   ├── app/
│   │   │   │   └── index.tsx   # Main app page
│   │   │   └── users/
│   │   │       └── index.tsx   # Users page
│   │   ├── _public/            # Public routes
│   │   │   ├── index.tsx       # Public home
│   │   │   └── waitlist.tsx
│   │   ├── auth/
│   │   │   ├── sign-in.tsx     # Sign-in page
│   │   │   ├── sign-up.tsx     # Sign-up page
│   │   │   └── bootstrap.tsx   # Bootstrap route (auth readiness gate)
│   │   ├── onboarding/
│   │   │   └── index.tsx
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── $.tsx       # Better Auth handler (all methods)
│   │   │   ├── logs/
│   │   │   │   └── route.tsx   # Log ingest endpoint
│   │   │   ├── users/
│   │   │   │   └── route.tsx   # Users API endpoint
│   │   │   └── internal/
│   │   │       ├── health/
│   │   │       │   └── route.tsx
│   │   │       └── env-check/
│   │   │           └── route.tsx
│   │   └── sentry-example/
│   │       └── index.tsx
│   ├── components/             # App-level layout components
│   │   ├── layout/
│   │   │   ├── RootLayout.tsx  # Root layout wrapper
│   │   │   ├── Footer.tsx
│   │   │   └── CopyrightYear.tsx
│   │   └── sections/
│   │       ├── Hero.tsx
│   │       └── FeaturesGrouped.tsx
│   ├── client.tsx              # Client entry point (hydration)
│   └── server.tsx              # Server entry point (SSR)
│
├── core/                       # Stable foundation (mostly unchanged)
│   ├── container/
│   │   └── index.ts            # DI container (reused as-is)
│   ├── contracts/              # All contracts (reused as-is)
│   │   ├── index.ts
│   │   ├── authorization.ts
│   │   ├── identity.ts
│   │   ├── tenancy.ts
│   │   ├── user.ts
│   │   ├── repositories.ts
│   │   ├── logger.ts
│   │   ├── primitives.ts
│   │   ├── roles.ts
│   │   ├── feature-flags.ts
│   │   ├── resources-actions.ts
│   │   └── provisioning-access.ts
│   ├── db/                     # DB layer (reused as-is)
│   │   ├── drivers/
│   │   ├── migrations/
│   │   ├── schema/
│   │   ├── create-db.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── error/
│   │   └── ignored-rejection-patterns.ts
│   ├── logger/                 # Simplified: server + browser only
│   │   ├── index.ts
│   │   ├── server.ts           # Pino server logger (unchanged)
│   │   ├── browser.ts          # Browser logger (unchanged)
│   │   ├── client.ts           # Client entry
│   │   ├── client-transport.ts
│   │   ├── streams.ts
│   │   ├── utils.ts
│   │   └── browser-utils.ts
│   │   # REMOVED: edge.ts, edge-utils.ts, di-edge.ts (no edge runtime)
│   ├── runtime/
│   │   ├── bootstrap.ts        # ADAPTED: composition root (no edge split)
│   │   └── infrastructure.ts   # DB lifecycle (unchanged)
│   │   # REMOVED: edge.ts (no edge composition root)
│   └── env.ts                  # ADAPTED: @t3-oss/env-core, VITE_ prefix
│
├── features/                   # Product-facing composition slices
│   ├── security-showcase/      # Adapted for TanStack Start patterns
│   │   ├── actions/            # createServerFn instead of server actions
│   │   ├── components/
│   │   └── lib/
│   └── user-management/
│       ├── api/                # Server route handlers
│       ├── components/
│       └── types/
│
├── modules/                    # Business/integration modules
│   ├── auth/                   # ADAPTED: Clerk → Better Auth
│   │   ├── infrastructure/
│   │   │   ├── better-auth/
│   │   │   │   └── BetterAuthIdentitySource.ts  # Better Auth adapter
│   │   │   ├── drizzle/
│   │   │   │   └── DrizzleInternalIdentityLookup.ts  # reused
│   │   │   └── RequestScopedIdentityProvider.ts     # reused logic
│   │   ├── lib/
│   │   │   └── auth.ts         # Better Auth instance definition
│   │   ├── ui/
│   │   │   └── AuthControls.tsx  # Sign in/out buttons (framework-agnostic)
│   │   └── index.ts            # Module registration (adapted)
│   ├── authorization/          # Reused as-is (domain logic unchanged)
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── index.ts
│   ├── provisioning/           # SIMPLIFIED (no Clerk external mapping)
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   │   └── drizzle/
│   │   │       └── DrizzleProvisioningService.ts  # reused
│   │   └── index.ts
│   ├── user/
│   │   └── infrastructure/
│   │       └── drizzle/
│   │           └── DrizzleUserRepository.ts  # reused
│   ├── billing/                # Reused as-is
│   └── feature-flags/          # Reused as-is
│
├── security/                   # REDESIGNED for createMiddleware()
│   ├── middleware/
│   │   ├── request/            # Request-level middleware (global)
│   │   │   ├── with-logging.ts       # Request logging middleware
│   │   │   ├── with-headers.ts       # Security headers middleware
│   │   │   ├── with-rate-limit.ts    # Rate limiting middleware
│   │   │   └── with-internal-api-guard.ts  # Internal API key guard
│   │   └── function/           # Server function middleware
│   │       ├── with-auth.ts          # Session auth middleware (injects context)
│   │       ├── with-authorization.ts # RBAC/ABAC middleware (injects policy result)
│   │       └── with-audit.ts         # Audit logging middleware
│   ├── actions/
│   │   ├── secure-server-fn.ts # createServerFn wrapper (replaces createSecureAction)
│   │   ├── action-audit.ts     # Audit log (reused)
│   │   └── action-replay.ts    # Replay protection (reused)
│   ├── core/
│   │   ├── security-context.ts       # SecurityContext builder (adapted)
│   │   ├── authorization-facade.ts   # AuthorizationFacade (reused)
│   │   └── security-dependencies.ts  # Dependency types (adapted)
│   ├── outbound/
│   │   └── secure-fetch.ts     # SSRF protection (reused)
│   ├── rsc/                    # REMOVED (no RSC)
│   └── utils/
│       └── security-logger.ts  # Security event logger (reused)
│
├── shared/                     # Neutral building blocks (mostly unchanged)
│   ├── components/
│   │   ├── Header.tsx          # Neutral header (reused)
│   │   ├── ErrorAlert.tsx      # Error display (reused)
│   │   ├── ui/
│   │   │   └── polymorphic-element.tsx
│   │   └── error/
│   │       └── client-error-boundary.tsx  # Adapted (no next/* deps)
│   ├── hooks/
│   │   ├── useAsyncHandler.ts  # Reused
│   │   └── useHydrationSafeState.ts  # Reused
│   ├── lib/
│   │   ├── api/
│   │   │   ├── api-client.ts         # HTTP client (reused)
│   │   │   ├── app-error.ts          # Error model (reused)
│   │   │   ├── response-service.ts   # API response builder (reused)
│   │   │   └── with-error-handler.ts # Error handler wrapper (adapted)
│   │   ├── network/
│   │   │   └── get-ip.ts       # IP extraction (reused)
│   │   ├── rate-limit/         # Rate limit logic (reused)
│   │   ├── mocks/              # MSW handlers (adapted)
│   │   └── routing/            # TanStack Router utilities
│   ├── types/
│   │   └── api-response.ts     # Reused
│   └── utils/
│       └── cn.ts               # Reused
│
├── testing/                    # Test infrastructure (adapted)
│   ├── db/
│   │   └── create-test-db.ts   # Reused
│   ├── factories/
│   │   ├── request.ts          # Adapted (no next/* deps)
│   │   └── security.ts         # Reused
│   ├── infrastructure/
│   │   ├── better-auth.ts      # NEW: Better Auth session mocks
│   │   ├── env.ts              # Reused
│   │   ├── logger.ts           # Reused
│   │   ├── network.ts          # Reused
│   │   ├── rate-limit.ts       # Reused
│   │   ├── security-domain.ts  # Reused
│   │   └── security-middleware.ts  # Adapted for createMiddleware
│   │   # REMOVED: clerk.ts, next-headers.ts
│   └── index.ts
│
├── stories/                    # Storybook stories
│   ├── Button.stories.ts
│   └── ...
│
└── types/
    └── globals.d.ts
```

---

## 4. Core Layer Adaptation

### 4.1 `src/core/env.ts` – Env config

**Change**: `@t3-oss/env-nextjs` → `@t3-oss/env-core`
**Change**: `NEXT_PUBLIC_` prefix → `VITE_` prefix for client vars

```ts
// src/core/env.ts
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    // ... same server vars as before
    AUTH_PROVIDER: z.enum(['better-auth']).default('better-auth'),
    // REMOVED: CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    // ADDED: BETTER_AUTH_SECRET, BETTER_AUTH_URL
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().optional(),
    // ... rest same
  },
  clientPrefix: 'VITE_',
  client: {
    VITE_APP_URL: z.url().optional(),
    VITE_LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    VITE_SENTRY_DSN: z.url().optional(),
    VITE_LOGFLARE_BROWSER_ENABLED: z.boolean().default(false),
    // REMOVED: NEXT_PUBLIC_* vars
    // REMOVED: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    // ADDED: VITE_E2E_ENABLED, VITE_BETTER_AUTH_* if needed
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    VITE_APP_URL: import.meta.env.VITE_APP_URL,
    // ...
  },
  emptyStringAsUndefined: true,
});
```

**Key removals**: All Clerk env vars removed (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, Clerk redirect URLs).
**Key additions**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

### 4.2 `src/core/runtime/bootstrap.ts` – Composition root

**Change**: No edge composition root. Single unified bootstrap.

```ts
// src/core/runtime/bootstrap.ts
export function createRequestContainer(config: AppConfig): Container {
  const container = new Container();
  const { dbRuntime } = getInfrastructure(config);

  container.register(INFRASTRUCTURE.DB, dbRuntime.db);

  container.registerModule(
    createAuthModule({ db: dbRuntime.db, ...config.auth }),
  );
  container.registerModule(createAuthorizationModule({ db: dbRuntime.db }));

  container.register(
    PROVISIONING.SERVICE,
    new DrizzleProvisioningService(dbRuntime.db, config.provisioning),
  );

  return container;
}

// REMOVED: createEdgeRequestContainer
// REMOVED: edge.ts
```

### 4.3 `src/core/logger/` – Simplified

**Remove**: `edge.ts`, `edge-utils.ts`, `di-edge.ts` (no edge runtime in TanStack Start)
**Keep**: `server.ts`, `browser.ts`, `client.ts`, `client-transport.ts`, `streams.ts`, `utils.ts`

Logger usage changes:

- Server logger: `import { logger } from '@/core/logger/server'` (same)
- Client logger: `import { logger } from '@/core/logger/client'` (same)
- No edge logger needed

---

## 5. Security Layer Redesign

### 5.1 Overview

The Next.js `proxy.ts` (Edge middleware) is **replaced** by TanStack Start's `createMiddleware()` system.

There are two types of middleware in TanStack Start:

1. **Request middleware** – intercepts all server requests (SSR + API routes + server functions)
2. **Server function middleware** – attaches to `createServerFn`, can inject typed context

### 5.2 Request middleware (global gate)

```ts
// src/security/middleware/request/with-headers.ts
import { createMiddleware } from '@tanstack/react-start';
import { env } from '@/core/env';

export const headersMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const response = await next();
    // Attach CSP, HSTS, X-Frame-Options, etc.
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // CSP header computed from env.SECURITY_CSP_* vars
    return response;
  },
);
```

```ts
// src/security/middleware/request/with-rate-limit.ts
import { createMiddleware } from '@tanstack/react-start';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';
import { getIP } from '@/shared/lib/network/get-ip';

export const rateLimitMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const ip = getIP(request.headers);
    const result = await checkRateLimit(ip);
    if (!result.success) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(
            Math.ceil((result.reset.getTime() - Date.now()) / 1000),
          ),
        },
      });
    }
    return next();
  },
);
```

```ts
// src/security/middleware/request/with-internal-api-guard.ts
import { createMiddleware } from '@tanstack/react-start';
import { env } from '@/core/env';

export const internalApiGuardMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/internal/')) {
      const key = request.headers.get('x-internal-api-key');
      if (key !== env.INTERNAL_API_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
    }
    return next();
  },
);
```

### 5.3 Server function middleware (per-action)

```ts
// src/security/middleware/function/with-auth.ts
import { createMiddleware } from '@tanstack/react-start';
import { getSession } from '@/modules/auth/lib/session';

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await getSession();
    if (!session) {
      throw new Error('Unauthorized');
    }
    return next({
      context: { session },
    });
  },
);
```

```ts
// src/security/middleware/function/with-authorization.ts
import { createMiddleware } from '@tanstack/react-start';
import type { AuthorizationContext } from '@/core/contracts/authorization';

export const authorizationMiddleware = (
  buildContext: (session: Session) => AuthorizationContext,
) =>
  createMiddleware({ type: 'function' })
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      const authContext = buildContext(context.session);
      const authService = getAuthorizationService(); // from DI
      const allowed = await authService.can(authContext);
      if (!allowed) {
        throw new Error('Forbidden');
      }
      return next({ context: { ...context, authorized: true } });
    });
```

### 5.4 `secure-server-fn.ts` – Replaces `createSecureAction`

The equivalent of `createSecureAction` is a `createSecureServerFn` wrapper:

```ts
// src/security/actions/secure-server-fn.ts
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/security/middleware/function/with-auth';
import { auditMiddleware } from '@/security/middleware/function/with-audit';
import type { ResourceContext, Action } from '@/core/contracts/authorization';

interface SecureServerFnOptions<TSchema extends z.ZodType, TResult> {
  method?: 'GET' | 'POST';
  schema: TSchema;
  resource?: ResourceContext;
  action?: Action;
  handler: (args: {
    data: z.infer<TSchema>;
    context: { session: Session; userId: string; tenantId: string };
  }) => Promise<TResult>;
}

export function createSecureServerFn<TSchema extends z.ZodType, TResult>(
  opts: SecureServerFnOptions<TSchema, TResult>,
) {
  return createServerFn({ method: opts.method ?? 'POST' })
    .middleware([authMiddleware, auditMiddleware])
    .validator((data: unknown) => opts.schema.parse(data))
    .handler(async ({ data, context }) => {
      return opts.handler({ data, context });
    });
}
```

**Usage**:

```ts
export const updateSettings = createSecureServerFn({
  schema: z.object({ title: z.string().min(5) }),
  resource: { type: 'settings' },
  handler: async ({ data, context }) => {
    // context.session.user.id available, derived server-side
    return db.settings.update(context.session.user.id, data);
  },
});
```

### 5.5 Route-level auth guard (beforeLoad)

```ts
// src/app/routes/_authed/route.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSession } from '@/modules/auth/lib/session';
import { ensureProvisioned } from '@/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const session = await getSession();

    if (!session) {
      throw redirect({
        to: '/auth/sign-in',
        search: { redirect: location.href },
      });
    }

    // Provisioning readiness check (equivalent to Node provisioning gate)
    const readiness = await checkProvisioningReadiness(session.user.id);

    if (readiness === 'BOOTSTRAP_REQUIRED') {
      throw redirect({ to: '/auth/bootstrap' });
    }
    if (readiness === 'ONBOARDING_REQUIRED') {
      throw redirect({ to: '/onboarding' });
    }

    return { session };
  },
});
```

### 5.6 Security context (adapted)

```ts
// src/security/core/security-context.ts
// No longer needs request from Next.js headers()
// Receives session from Better Auth directly

export interface SecurityContext {
  user?: {
    id: string;
    tenantId: string;
    attributes?: Record<string, unknown>;
  };
  readinessStatus: ReadinessStatus;
  ip?: string;
  correlationId: string;
  environment: string;
}

export async function createSecurityContext(
  session: Session | null,
  request: Request,
): Promise<SecurityContext> {
  // Build context from Better Auth session (no Clerk dependency)
}
```

### 5.7 Security pipeline composition

```ts
// vite.config.ts – global request middleware registration
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

export default defineConfig({
  plugins: [
    tanstackStart({
      // Global middleware applied to all requests
      // (via middleware.ts file in routes/ or explicit registration)
    }),
  ],
});
```

TanStack Start supports global middleware via a dedicated file:

```ts
// src/app/global-middleware.ts
import { registerGlobalMiddleware } from '@tanstack/react-start';
import { headersMiddleware } from '@/security/middleware/request/with-headers';
import { rateLimitMiddleware } from '@/security/middleware/request/with-rate-limit';
import { internalApiGuardMiddleware } from '@/security/middleware/request/with-internal-api-guard';

registerGlobalMiddleware({
  middleware: [
    headersMiddleware,
    rateLimitMiddleware,
    internalApiGuardMiddleware,
  ],
});
```

---

## 6. Auth Module Redesign (Better Auth)

### 6.1 Better Auth instance

```ts
// src/modules/auth/lib/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { db } from '@/core/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // configurable
  },
  socialProviders: {
    // optional: github, google, etc.
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache session for 5 minutes
    },
  },
  plugins: [
    tanstackStartCookies(), // MUST be last plugin
  ],
});
```

### 6.2 Auth client (browser side)

```ts
// src/modules/auth/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_APP_URL ?? 'http://localhost:3000',
});

export const { signIn, signOut, signUp, useSession } = authClient;
```

### 6.3 Session server function

```ts
// src/modules/auth/lib/session.ts
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from './auth';

export const getSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders();
    return auth.api.getSession({ headers });
  },
);

export const ensureSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    if (!session) throw new Error('Unauthorized');
    return session;
  },
);
```

### 6.4 Auth API route handler

```ts
// src/app/routes/api/auth/$.tsx
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/modules/auth/lib/auth';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => auth.handler(request),
      POST: async ({ request }) => auth.handler(request),
    },
  },
});
```

### 6.5 Auth module DI registration (simplified)

```ts
// src/modules/auth/index.ts
export function createAuthModule(config: AuthModuleConfig): Module {
  return {
    register(container: Container) {
      // Better Auth manages its own DB tables via Drizzle adapter
      // We only need to register identity provider for our domain model

      const identityProvider = new BetterAuthIdentityProvider(auth, config.db);
      const tenantResolver = buildTenantResolver(config);

      container.register(AUTH.IDENTITY_PROVIDER, identityProvider);
      container.register(AUTH.TENANT_RESOLVER, tenantResolver);
      container.register(
        AUTH.USER_REPOSITORY,
        new DrizzleUserRepository(config.db),
      );
    },
  };
}
```

### 6.6 Identity mapping (simplified)

With Better Auth, there is **no external-to-internal identity mapping complexity**:

- Better Auth generates and manages internal user IDs directly in our DB
- No `auth_user_identities` table needed for provider mapping
- `DrizzleInternalIdentityLookup` is simplified or replaced by direct Better Auth user lookup
- `RequestScopedIdentityProvider` reads from Better Auth session

```ts
// src/modules/auth/infrastructure/BetterAuthIdentityProvider.ts
export class BetterAuthIdentityProvider implements IdentityProvider {
  async getIdentity(session: Session): Promise<InternalIdentity | null> {
    // session.user.id IS the internal user ID in Better Auth + our Drizzle schema
    return {
      userId: session.user.id as UserId,
      email: session.user.email,
    };
  }
}
```

---

## 7. Provisioning Module (Simplified)

### 7.1 What changes vs Next.js version

In the Next.js boilerplate, provisioning was complex because:

- Clerk assigned external user IDs that needed mapping to internal UUIDs
- Provider `orgId` needed mapping to internal tenant UUIDs
- Bootstrap route had to resolve: external Clerk ID → internal user → internal tenant

With Better Auth:

- Better Auth creates internal user UUIDs directly in our DB
- No external-to-internal ID mapping needed
- Provisioning focus is: initial tenant creation, role assignment, policy seeding

### 7.2 What remains

```ts
// src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts
// Reused with simplified inputs:
export class DrizzleProvisioningService implements ProvisioningService {
  async ensureProvisioned(
    input: ProvisioningInput,
  ): Promise<ProvisioningResult> {
    // No longer needs external ID mapping
    // input.userId IS the internal user ID from Better Auth
    // Creates tenant, membership, roles, policy templates idempotently
  }
}
```

### 7.3 Bootstrap route (simplified)

```ts
// src/app/routes/auth/bootstrap.tsx
export const Route = createFileRoute('/auth/bootstrap')({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: '/auth/sign-in' });
    return { session };
  },
  component: BootstrapPage,
});

// Server action (bootstraps on load)
export const bootstrapUser = createServerFn({ method: 'POST' }).handler(
  async () => {
    const session = await ensureSession();
    const container = createRequestContainer(buildConfig());
    const provisioningService = container.resolve(PROVISIONING.SERVICE);

    const result = await provisioningService.ensureProvisioned({
      userId: session.user.id, // Already internal UUID from Better Auth
      email: session.user.email,
    });

    if (result.onboardingRequired) {
      throw redirect({ to: '/onboarding' });
    }
    throw redirect({ to: '/app' });
  },
);
```

---

## 8. Routing Structure

### 8.1 TanStack Router conventions

```
src/app/routes/
  __root.tsx           # Root layout (ClerkProvider equivalent = auth context)
  index.tsx            # Public home (/)
  _authed.tsx          # Protected layout (beforeLoad auth check) – pathless route
  _authed/
    app/
      index.tsx        # /app
    users/
      index.tsx        # /users
  _public.tsx          # Public marketing layout (pathless)
  _public/
    waitlist.tsx       # /waitlist
  auth/
    sign-in.tsx        # /auth/sign-in
    sign-up.tsx        # /auth/sign-up
    bootstrap.tsx      # /auth/bootstrap
  onboarding/
    index.tsx          # /onboarding
  api/
    auth/
      $.tsx            # /api/auth/* (Better Auth handler)
    logs/
      route.tsx        # /api/logs
    users/
      route.tsx        # /api/users
    internal/
      health/
        route.tsx
      env-check/
        route.tsx
```

### 8.2 Root layout

```tsx
// src/app/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Sentry } from '@sentry/tanstackstart-react';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en">
      <head />
      <body>
        <Outlet />
      </body>
    </html>
  );
}
```

### 8.3 Data loading pattern

```ts
// Route loader (replaces RSC data fetching)
export const Route = createFileRoute('/users')({
  loader: async () => {
    return await fetchUsers()  // server-side in loader
  },
  component: UsersPage,
})

function UsersPage() {
  const users = Route.useLoaderData()
  return <UserList users={users} />
}
```

---

## 9. DI Composition Root (TanStack Start)

### 9.1 Composition point

In Next.js: composition happened in `getAppContainer()` (singleton), used in server actions and route handlers.

In TanStack Start: composition happens **per request** inside `createServerFn` handlers or route loaders. No singleton container – request-scoped by default.

```ts
// src/core/runtime/bootstrap.ts
let _container: Container | undefined;

export function getAppContainer(): Container {
  if (!_container) {
    _container = createRequestContainer(buildConfig());
  }
  return _container;
}

// For request-scoped use (preferred in server functions):
export function createChildContainer(): Container {
  return getAppContainer().createChild();
}
```

### 9.2 Usage in server functions

```ts
// features/user-management/api/getUsers.ts
export const getUsers = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const container = createChildContainer();
    const userRepo = container.resolve<UserRepository>(AUTH.USER_REPOSITORY);
    return userRepo.findAll({ tenantId: context.session.user.tenantId });
  });
```

### 9.3 No edge composition root

The `createEdgeRequestContainer` and `src/core/runtime/edge.ts` are **deleted**. There is no Edge runtime in TanStack Start. The unified Node/Nitro runtime removes this complexity entirely.

---

## 10. Testing Infrastructure Adaptation

### 10.1 Changes to test setup

**Remove** (Next.js specific):

- `tests/setup.tsx` mocks for `next/image`, `next/navigation`, `next/router`
- `src/testing/infrastructure/clerk.ts`
- `src/testing/infrastructure/next-headers.ts`

**Add** (TanStack Start specific):

- `src/testing/infrastructure/better-auth.ts` – session mocking
- `src/testing/infrastructure/tanstack-router.ts` – router mocking
- `tests/setup.tsx` – updated for TanStack Start (no next/\* mocks)

### 10.2 Better Auth test mocking

```ts
// src/testing/infrastructure/better-auth.ts
import { vi } from 'vitest';
import type { Session } from 'better-auth';

export function mockSession(session: Partial<Session> | null = null) {
  // Mock the getSession server function
  vi.mock('@/modules/auth/lib/session', () => ({
    getSession: vi.fn().mockResolvedValue(session),
    ensureSession: vi.fn().mockImplementation(() => {
      if (!session) throw new Error('Unauthorized');
      return session;
    }),
  }));
}
```

### 10.3 Vitest config changes

```ts
// vitest.unit.config.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.integration.test.{ts,tsx}'],
  },
});
```

No `jsdom` for server-side tests. RTL tests use `jsdom` environment explicitly.

### 10.4 E2E (Playwright) changes

Playwright config changes minimally:

- Base URL remains `http://localhost:3000`
- Auth flow: Better Auth email/password sign-in instead of Clerk flows
- No Clerk fixtures needed

---

## 11. Vite / TanStack Start Config

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackStart({
      target: process.env.TARGET === 'vercel' ? 'vercel' : 'node-server',
      spa: { enabled: false }, // SSR mode by default
    }),
    viteReact(),
    tsconfigPaths(),
  ],
  // Sentry handled via @sentry/tanstackstart-react plugin
}));
```

**Note**: `TARGET=vercel` env var switches deployment mode. Default is `node-server`.

---

## 12. Observability

### 12.1 Sentry integration

```ts
// src/instrumentation.ts (server entry hook)
import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

```ts
// src/instrumentation-client.ts (client entry hook)
import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
  integrations: [Sentry.tanstackRouterBrowserTracingIntegration()],
});
```

### 12.2 Pino logging (simplified)

- Server: `src/core/logger/server.ts` – unchanged
- Browser: `src/core/logger/browser.ts` – unchanged
- **Removed**: `edge.ts` (no edge runtime)

---

## 13. CI/CD

### 13.1 Commands (updated)

| Command   | Next.js          | TanStack Start                               |
| --------- | ---------------- | -------------------------------------------- |
| Dev       | `pnpm dev`       | `pnpm dev`                                   |
| Build     | `pnpm build`     | `pnpm build`                                 |
| Start     | `pnpm start`     | `pnpm start` (node .output/server/index.mjs) |
| Typecheck | `pnpm typecheck` | `pnpm typecheck`                             |
| Lint      | `pnpm lint`      | `pnpm lint`                                  |
| Test      | `pnpm test`      | `pnpm test`                                  |
| E2E       | `pnpm e2e`       | `pnpm e2e`                                   |

### 13.2 GitHub Actions workflows

Most workflows are reused. Changes:

- `pr-validation.yml` – same commands, no Next.js-specific flags
- `prod-deploy.yml` – Vercel deploy via `TARGET=vercel pnpm build`
- `preview-deploy.yml` – same
- Remove: Lighthouse CI (TanStack Start does not have a direct equivalent of Next.js Lighthouse CI integration; can be re-added later)
- Keep: security-scan, Chromatic, Playwright e2e

---

## 14. Delivery Phases

Each phase is independently testable and reviewable. Phases build on each other.

### Phase 1 – Foundation

- Project scaffold (`vite.config.ts`, `tsconfig.json`, `package.json`)
- TypeScript strict, path aliases
- ESLint + Prettier (reused config)
- Tailwind CSS 4
- Conventional Commits + Husky
- Semantic Release
- `src/core/env.ts` (adapted for `@t3-oss/env-core`)
- Basic `__root.tsx` and `index.tsx` route
- **Verification**: `pnpm dev` runs, `pnpm typecheck` passes, `pnpm lint` passes

### Phase 2 – Core Layer

- DI container (reused `src/core/container/`)
- All contracts (reused `src/core/contracts/`)
- Logger (simplified: server + browser only)
- Error contracts
- `src/core/runtime/bootstrap.ts` (adapted, no edge root)
- **Verification**: unit tests pass for container, contracts, logger

### Phase 3 – DB Layer

- Drizzle ORM setup (reused drivers, schema, migrations)
- PGLite for dev/test
- Postgres for production
- `create-db.ts`, `types.ts`
- **Verification**: `pnpm test:db` passes

### Phase 4 – Better Auth Module

- Better Auth instance (`src/modules/auth/lib/auth.ts`)
- Auth client (`src/modules/auth/lib/auth-client.ts`)
- Session server functions (`getSession`, `ensureSession`)
- Auth API route (`/api/auth/$`)
- `BetterAuthIdentityProvider` adapter
- DI module registration
- Sign-in, sign-up pages
- **Verification**: can sign up, sign in, sign out; session persists; unit tests pass

### Phase 5 – Security Layer

- Global middleware registration (`global-middleware.ts`)
- Request middleware: `withHeaders`, `withRateLimit`, `withInternalApiGuard`, `withLogging`
- Server function middleware: `authMiddleware`, `auditMiddleware`
- `createSecureServerFn` wrapper
- SecurityContext builder
- AuthorizationFacade (reused)
- SSRF protection (`secureFetch`) (reused)
- **Verification**: middleware fires on all requests; auth-gated server fn rejects unauthenticated; internal API guard works

### Phase 6 – Authorization Module

- Reuse `modules/authorization/domain/` (PolicyEngine, AuthorizationService, conditions)
- Drizzle repositories (reused)
- Authorization DI registration
- `authorizationMiddleware` (per-function)
- **Verification**: policy evaluation tests pass; owner/member scenarios work

### Phase 7 – Provisioning Module

- Simplified `DrizzleProvisioningService` (no Clerk external mapping)
- Bootstrap route (`/auth/bootstrap`)
- Onboarding route + server function
- Protected route group (`_authed`) with `beforeLoad` provisioning check
- **Verification**: first-login flow works end-to-end; provisioning is idempotent

### Phase 8 – Features

- User management feature (`src/features/user-management/`)
- Security showcase feature (adapted for TanStack Start)
- **Verification**: feature pages render; server functions work; E2E flows pass

### Phase 9 – Observability

- Sentry integration (`@sentry/tanstackstart-react`)
- Pino logging (server + browser)
- Log ingest endpoint (`/api/logs`)
- Security event logger
- **Verification**: errors reported to Sentry; logs appear in console/Logflare

### Phase 10 – Testing Infrastructure

- Vitest config (unit + integration)
- RTL setup without `next/*` mocks
- Better Auth mocks
- TanStack Router test utilities
- MSW handlers (adapted)
- **Verification**: `pnpm test` passes; `pnpm test:integration` passes

### Phase 11 – Storybook

- `@storybook/react-vite` setup
- Existing stories adapted (no `next/*` deps)
- **Verification**: `pnpm storybook` runs; stories render

### Phase 12 – CI/CD

- GitHub Actions workflows adapted
- Vercel deploy workflow with `TARGET=vercel`
- Node.js deploy workflow documented
- **Verification**: CI pipeline green on PR

### Phase 13 – Feature Flag Readiness Seams

- Feature flag contract preserved (`src/core/contracts/feature-flags.ts`)
- `modules/feature-flags/` stub documented
- Usage pattern documented
- **Verification**: no violations; seams are in place

### Phase 14 – Tenancy Readiness Seams

- Tenancy contracts preserved (`src/core/contracts/tenancy.ts`)
- Multi-tenancy modes documented for Better Auth org context
- `TENANCY_MODE` env var preserved
- **Verification**: single-tenant mode works end-to-end

---

## 15. Risks and Tradeoffs

### Risk 1 – TanStack Start v1 RC stability

**Risk**: Minor breaking changes before v1 stable.
**Mitigation**: Pin to `^1`, review changelog on upgrade. API marked stable, changes should be minor.

### Risk 2 – Better Auth learning curve

**Risk**: Team unfamiliar with Better Auth vs Clerk.
**Mitigation**: Adapter isolation in `modules/auth/` – Better Auth SDK stays inside that module. Business logic sees only contracts.

### Risk 3 – No global middleware precedent in TanStack Start

**Risk**: Global request middleware behavior may differ from Next.js middleware in edge cases.
**Mitigation**: Test middleware chain thoroughly in Phase 5. Use integration tests.

### Risk 4 – Sentry `@sentry/tanstackstart-react` maturity

**Risk**: SDK is young (published March 19, 2026). May have incomplete coverage.
**Mitigation**: SDK is published by Sentry official bot, Sentry is official partner. Monitor for issues.

### Risk 5 – Provisioning simplification correctness

**Risk**: Removing Clerk external ID mapping may miss edge cases.
**Mitigation**: Better Auth gives us direct ownership of user IDs. The simplification is architectural soundness, not a shortcut.

### Risk 6 – Deployment target differences (Vercel cold starts)

**Risk**: DB connection pooling differences between Vercel (serverless) and Node (persistent).
**Mitigation**: Document clearly. Use Upstash Redis (HTTP, serverless-safe). For DB: use Neon or PgBouncer on Vercel.
