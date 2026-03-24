# Phase 5: Security Layer – createMiddleware Pipeline

## Objective

Replace the Next.js Edge middleware pipeline (`src/proxy.ts`) with TanStack Start's `createMiddleware()` system. This is the most architecturally significant redesign in the migration, and also the most architecturally superior outcome.

**Prerequisite**: Phase 4 (Auth Module) complete. Session infrastructure must exist before auth middleware can be built.

---

## Why This Is Better Than Next.js Proxy

In the Next.js boilerplate, the security pipeline is split across two runtimes:

- **Edge** (`proxy.ts`): security headers, rate limiting, internal API guard, session presence gate (no DB)
- **Node** (`createSecureAction`): full RBAC/ABAC, provisioning readiness, resource authorization

This split exists because Next.js middleware runs on Edge runtime by default, which **cannot access DB** (see `docs/architecture/15`).

In TanStack Start, **there is no Edge runtime**. Nitro runs on Node.js. The entire security pipeline can run in one context:

| Concern            | Next.js Proxy (Edge)      | TanStack Start                                 |
| ------------------ | ------------------------- | ---------------------------------------------- |
| Security headers   | ✅ Edge middleware        | ✅ Request middleware                          |
| Rate limiting      | ✅ Edge middleware        | ✅ Request middleware                          |
| Internal API guard | ✅ Edge middleware        | ✅ Request middleware                          |
| Session gate       | ✅ Edge (no DB)           | ✅ Request middleware (or function middleware) |
| RBAC/ABAC          | ❌ Must be in Node action | ✅ Can be in function middleware               |
| Provisioning gate  | ❌ Must be in Node action | ✅ Can be in function middleware               |
| Typed context      | ❌ Not possible           | ✅ Function middleware injects typed context   |

**Result**: The `createEdgeRequestContainer`, `enforceResourceAuthorization: false`, and the entire Edge/Node split complexity disappears.

---

## 1. Middleware System Overview

TanStack Start has two `createMiddleware()` variants:

### Request middleware (global)

Intercepts **all** server requests: SSR page renders, API routes, server function calls.

```ts
createMiddleware().server(async ({ next, request }) => {
  // runs for every request
  return next();
});
```

Registered globally via `registerGlobalMiddleware()`.

### Function middleware (per server function)

Attaches to specific `createServerFn()` calls. Can inject typed context.

```ts
createMiddleware({ type: 'function' }).server(async ({ next, context }) => {
  // runs only when attached server function is called
  return next({ context: { ...context, newField: value } });
});
```

Composed via `.middleware([...])` on `createServerFn`.

---

## 2. Request Middleware (Global Security Gate)

### `src/security/middleware/request/with-logging.ts`

```ts
import { createMiddleware } from '@tanstack/react-start';
import { logger } from '@/core/logger/server';
import { getIP } from '@/shared/lib/network/get-ip';
import { generateCorrelationId } from '@/shared/lib/correlation';

export const loggingMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const correlationId = generateCorrelationId();
    const ip = getIP(request.headers);
    const start = Date.now();

    logger.info(
      {
        correlationId,
        method: request.method,
        url: request.url,
        ip,
      },
      'Incoming request',
    );

    const response = await next();

    logger.info(
      {
        correlationId,
        status: response.status,
        durationMs: Date.now() - start,
      },
      'Request completed',
    );

    response.headers.set('x-correlation-id', correlationId);

    return response;
  },
);
```

### `src/security/middleware/request/with-headers.ts`

```ts
import { createMiddleware } from '@tanstack/react-start';
import { env } from '@/core/env';

export const headersMiddleware = createMiddleware().server(async ({ next }) => {
  const response = await next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  const scriptSrc =
    `'self' 'unsafe-inline' ${env.VITE_CSP_SCRIPT_EXTRA}`.trim();
  const connectSrc = `'self' ${env.VITE_CSP_CONNECT_EXTRA}`.trim();
  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${env.VITE_CSP_IMG_EXTRA}`.trim(),
    `font-src 'self' ${env.VITE_CSP_FONT_EXTRA}`.trim(),
    `connect-src ${connectSrc}`,
    `frame-src 'none' ${env.VITE_CSP_FRAME_EXTRA}`.trim(),
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  return response;
});
```

### `src/security/middleware/request/with-rate-limit.ts`

```ts
import { createMiddleware } from '@tanstack/react-start';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';
import { getIP } from '@/shared/lib/network/get-ip';

export const rateLimitMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const url = new URL(request.url);

    // Only rate limit API routes
    if (!url.pathname.startsWith('/api/')) {
      return next();
    }

    const ip = getIP(request.headers);
    const result = await checkRateLimit(ip);

    if (!result.success) {
      const retryAfter = Math.ceil(
        (result.reset.getTime() - Date.now()) / 1000,
      );
      return new Response(
        JSON.stringify({ status: 'rate_limited', error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        },
      );
    }

    return next();
  },
);
```

### `src/security/middleware/request/with-internal-api-guard.ts`

```ts
import { createMiddleware } from '@tanstack/react-start';
import { env } from '@/core/env';

export const internalApiGuardMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/internal/')) {
      return next();
    }

    const key = request.headers.get('x-internal-api-key');
    if (!key || key !== env.INTERNAL_API_KEY) {
      return new Response(
        JSON.stringify({ status: 'forbidden', error: 'Forbidden' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return next();
  },
);
```

### `src/security/middleware/request/index.ts`

```ts
export { loggingMiddleware } from './with-logging';
export { headersMiddleware } from './with-headers';
export { rateLimitMiddleware } from './with-rate-limit';
export { internalApiGuardMiddleware } from './with-internal-api-guard';
```

---

## 3. Global Middleware Registration

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

This file is imported at `src/app/server.tsx` entry point.

**Order matters**: middlewares run in registration order. Logging should run first (to capture all requests including rejected ones).

---

## 4. Server Function Middleware

### `src/security/middleware/function/with-auth.ts`

```ts
import { createMiddleware } from '@tanstack/react-start';
import { getSession } from '@/modules/auth/lib/session';
import type { Session } from '@/modules/auth/lib/auth';

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await getSession();

    if (!session) {
      throw new Error('Unauthorized: session required');
    }

    return next({
      context: {
        session,
        userId: session.user.id,
      },
    });
  },
);
```

### `src/security/middleware/function/with-authorization.ts`

```ts
import { createMiddleware } from '@tanstack/react-start';
import { authMiddleware } from './with-auth';
import { getAppContainer } from '@/core/runtime/bootstrap';
import { AUTHORIZATION } from '@/core/contracts';
import type {
  AuthorizationService,
  ResourceContext,
  Action,
} from '@/core/contracts/authorization';

export function authorizationMiddleware(
  resource: ResourceContext,
  action: Action,
) {
  return createMiddleware({ type: 'function' })
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      const container = getAppContainer();
      const authService = container.resolve<AuthorizationService>(
        AUTHORIZATION.SERVICE,
      );

      const allowed = await authService.can({
        subject: { id: context.userId, attributes: {} },
        resource,
        action,
        environment: { time: new Date() },
      });

      if (!allowed) {
        throw new Error(`Forbidden: action ${action} on ${resource.type}`);
      }

      return next({ context: { ...context, authorized: true } });
    });
}
```

### `src/security/middleware/function/with-audit.ts`

```ts
import { createMiddleware } from '@tanstack/react-start';
import { authMiddleware } from './with-auth';
import { logActionAudit } from '@/security/actions/action-audit';

export const auditMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context, data }) => {
    try {
      const result = await next();
      await logActionAudit({
        userId: context.userId,
        action: 'server-fn',
        result: 'success',
      });
      return result;
    } catch (error) {
      await logActionAudit({
        userId: context.session?.user.id,
        action: 'server-fn',
        result: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
```

---

## 5. `createSecureServerFn` – Replaces `createSecureAction`

This is the primary security abstraction for server functions – the equivalent of `createSecureAction` in the Next.js boilerplate.

### `src/security/actions/secure-server-fn.ts`

```ts
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/security/middleware/function/with-auth';
import { auditMiddleware } from '@/security/middleware/function/with-audit';
import type { ResourceContext, Action } from '@/core/contracts/authorization';
import { getAppContainer } from '@/core/runtime/bootstrap';
import { AUTHORIZATION, PROVISIONING } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { ProvisioningService } from '@/core/contracts/provisioning-access';
import { SecurityContext } from './security-context';

export interface SecureServerFnOptions<TSchema extends z.ZodType, TResult> {
  method?: 'GET' | 'POST';
  schema: TSchema;
  resource?: ResourceContext;
  action?: Action;
  handler: (args: {
    data: z.infer<TSchema>;
    context: {
      session: Session;
      userId: string;
      securityContext: SecurityContext;
    };
  }) => Promise<TResult>;
}

export type SecureServerFnResult<T> =
  | { status: 'success'; data: T }
  | { status: 'validation_error'; errors: Record<string, string[]> }
  | { status: 'unauthorized'; error: string }
  | { status: 'bootstrap_required' }
  | { status: 'onboarding_required' }
  | { status: 'tenant_context_required' }
  | { status: 'error'; error: string };

export function createSecureServerFn<TSchema extends z.ZodType, TResult>(
  opts: SecureServerFnOptions<TSchema, TResult>,
) {
  return createServerFn({ method: opts.method ?? 'POST' })
    .middleware([authMiddleware, auditMiddleware])
    .validator((data: unknown): z.infer<TSchema> => {
      const result = opts.schema.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    })
    .handler(
      async ({ data, context }): Promise<SecureServerFnResult<TResult>> => {
        try {
          const container = getAppContainer();
          const authService = container.resolve<AuthorizationService>(
            AUTHORIZATION.SERVICE,
          );
          const provisioningService = container.resolve<ProvisioningService>(
            PROVISIONING.SERVICE,
          );

          // Readiness gate
          const readiness = await provisioningService.checkReadiness(
            context.session.user.id,
          );

          if (readiness !== 'READY') {
            const statusMap: Record<string, SecureServerFnResult<TResult>> = {
              BOOTSTRAP_REQUIRED: { status: 'bootstrap_required' },
              ONBOARDING_REQUIRED: { status: 'onboarding_required' },
              TENANT_CONTEXT_REQUIRED: { status: 'tenant_context_required' },
            };
            return (
              statusMap[readiness] ?? { status: 'error', error: 'Not ready' }
            );
          }

          // Resource authorization (if specified)
          if (opts.resource && opts.action) {
            const allowed = await authService.can({
              subject: { id: context.userId, attributes: {} },
              resource: opts.resource,
              action: opts.action,
              environment: { time: new Date() },
            });

            if (!allowed) {
              return {
                status: 'unauthorized',
                error: `Permission denied for action: ${opts.action}`,
              };
            }
          }

          const securityContext = await SecurityContext.build(context.session);

          const result = await opts.handler({
            data,
            context: { ...context, securityContext },
          });

          return { status: 'success', data: result };
        } catch (error) {
          if (error instanceof z.ZodError) {
            return {
              status: 'validation_error',
              errors: error.flatten().fieldErrors as Record<string, string[]>,
            };
          }

          const message =
            error instanceof Error ? error.message : 'Internal Server Error';

          return { status: 'error', error: message };
        }
      },
    );
}
```

**Usage**:

```ts
// In a feature action file
export const updateUserSettings = createSecureServerFn({
  schema: z.object({ displayName: z.string().min(2).max(50) }),
  resource: { type: 'user-settings', id: 'self' },
  action: 'update',
  handler: async ({ data, context }) => {
    return updateSettings(context.session.user.id, data);
  },
});

// In a client component
const result = await updateUserSettings({ data: { displayName: 'Alice' } });
if (result.status === 'success') {
  console.log(result.data);
}
```

---

## 6. Outbound Security (SSRF Protection)

### `src/security/outbound/secure-fetch.ts` (reused as-is)

The SSRF protection implementation has no framework coupling. It wraps `fetch` and checks outbound URLs against `env.SECURITY_ALLOWED_OUTBOUND_HOSTS`. No changes required.

---

## 7. Security Context Builder

### `src/security/core/security-context.ts` (adapted)

```ts
import type { Session } from '@/modules/auth/lib/auth';
import { getAppContainer } from '@/core/runtime/bootstrap';
import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';

export interface SecurityContext {
  userId: string;
  email: string;
  tenantId: string | undefined;
  session: Session;
  ip: string | undefined;
  readinessStatus: ReadinessStatus;
  user: {
    id: string;
    email: string;
    tenantId: string | undefined;
    attributes: Record<string, unknown>;
  };
}

export type ReadinessStatus =
  | 'READY'
  | 'BOOTSTRAP_REQUIRED'
  | 'ONBOARDING_REQUIRED'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MEMBERSHIP_REQUIRED';

export class SecurityContext {
  static async build(session: Session): Promise<SecurityContext> {
    const container = getAppContainer();
    const identityProvider = container.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    );

    const identity = await identityProvider.getIdentity();

    return {
      userId: session.user.id,
      email: session.user.email,
      tenantId: identity?.tenantId,
      session,
      ip: undefined,
      readinessStatus: identity ? 'READY' : 'BOOTSTRAP_REQUIRED',
      user: {
        id: identity?.id ?? session.user.id,
        email: session.user.email,
        tenantId: identity?.tenantId,
        attributes: {},
      },
    };
  }
}
```

---

## 8. Files Deleted from `src/security/`

| Deleted                                                    | Reason                                  |
| ---------------------------------------------------------- | --------------------------------------- |
| `src/security/rsc/`                                        | No RSC in TanStack Start                |
| `src/security/middleware/with-auth.ts` (old)               | Replaced by function middleware version |
| `src/security/middleware/with-security.ts` (old)           | Replaced by request middleware          |
| `src/security/middleware/with-rate-limit.ts` (old)         | Moved to `request/`                     |
| `src/security/middleware/with-internal-api-guard.ts` (old) | Moved to `request/`                     |
| `src/security/middleware/route-classification.ts`          | Edge-specific, not needed               |
| `src/security/core/security-dependencies.ts`               | Edge-specific, replaced                 |

---

## 9. New `src/security/` Structure

```
src/security/
├── middleware/
│   ├── request/                # Global request-level middleware
│   │   ├── with-logging.ts
│   │   ├── with-headers.ts
│   │   ├── with-rate-limit.ts
│   │   ├── with-internal-api-guard.ts
│   │   └── index.ts
│   └── function/               # Per-server-function middleware
│       ├── with-auth.ts
│       ├── with-authorization.ts
│       ├── with-audit.ts
│       └── index.ts
├── actions/
│   ├── secure-server-fn.ts     # createSecureServerFn wrapper
│   ├── action-audit.ts         # Audit log (reused)
│   └── action-replay.ts        # Replay protection (reused)
├── core/
│   ├── security-context.ts     # SecurityContext builder (adapted)
│   └── authorization-facade.ts # AuthorizationFacade (reused)
├── outbound/
│   └── secure-fetch.ts         # SSRF protection (reused)
└── utils/
    └── security-logger.ts      # Security event logger (reused)
```

---

## Risks

| Risk                                                                                         | Severity | Mitigation                                                                              |
| -------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| Request middleware runs on SSR page renders, not just API calls – potential performance cost | MINOR    | Rate limit middleware already guards by pathname prefix; headers middleware is cheap    |
| `registerGlobalMiddleware` is a module-level side effect – import order matters              | MAJOR    | Import `global-middleware.ts` first in `server.tsx` before app setup                    |
| `getAppContainer()` called per server function invocation – singleton must be stable         | MAJOR    | `getAppContainer()` returns same container instance via `getInfrastructure()` singleton |
| Typed middleware context may confuse TypeScript in some edge cases with `createServerFn`     | MINOR    | Use explicit type annotations on context parameters                                     |
| `createSecureServerFn` error response shape must match what client code expects              | MAJOR    | Define `SecureServerFnResult<T>` as a shared type, use discriminated union consistently |

---

## Validation

Phase 5 is complete when:

- [ ] All 4 request middlewares run on every API request (verified via logging)
- [ ] `X-Frame-Options: DENY` present in all response headers
- [ ] Rate limit middleware returns 429 after limit exceeded
- [ ] Internal API guard returns 403 without correct key
- [ ] `authMiddleware` throws 401 when no session
- [ ] `createSecureServerFn` returns `{ status: 'success' }` for authenticated, authorized user
- [ ] `createSecureServerFn` returns `{ status: 'unauthorized' }` for missing session
- [ ] `createSecureServerFn` returns `{ status: 'validation_error' }` for invalid input
- [ ] `pnpm typecheck` passes
- [ ] Unit tests: each middleware in isolation
- [ ] Integration test: full request pipeline
