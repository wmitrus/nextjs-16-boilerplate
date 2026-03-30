# Phase 9: Observability – Sentry + Pino Logging

## Objective

Integrate `@sentry/tanstackstart-react` and Pino logging. Both are significantly simpler in TanStack Start than in Next.js – no Edge runtime logging, no `instrumentation.ts` hooks, no Turbopack/Webpack build complexity.

**Prerequisite**: Phase 1 (Foundation) complete. Sentry Vite plugin is already in `vite.config.ts`.

---

## What Changes

| File/Dir                            | Status      | Change                                       |
| ----------------------------------- | ----------- | -------------------------------------------- |
| `src/instrumentation.ts`            | **Deleted** | Replaced by `src/app/server.tsx` Sentry init |
| `src/instrumentation-client.ts`     | **Deleted** | Replaced by `src/app/client.tsx` Sentry init |
| `src/core/logger/edge.ts`           | **Deleted** | No edge runtime (done in Phase 2)            |
| `src/core/logger/server.ts`         | **Reused**  | No change                                    |
| `src/core/logger/browser.ts`        | **Reused**  | No change                                    |
| `src/core/logger/client.ts`         | **Reused**  | No change                                    |
| `src/core/logger/streams.ts`        | **Reused**  | No change                                    |
| `src/app/server.tsx`                | **Adapted** | Add Sentry init before handler export        |
| `src/app/client.tsx`                | **Adapted** | Add Sentry init before hydration             |
| `src/app/routes/api/logs/route.tsx` | **New**     | Log ingest endpoint (replaces Next.js route) |

---

## 1. Sentry Setup

### Package

```bash
pnpm add @sentry/tanstackstart-react
```

### `src/app/server.tsx` – Server Sentry Init

```tsx
import * as Sentry from '@sentry/tanstackstart-react';
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { createRouter } from './router';
import './global-middleware';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [Sentry.tanstackStartBrowserTracingIntegration()],
  beforeSend(event) {
    // Scrub sensitive data
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    return event;
  },
});

export default Sentry.wrapStartHandler(
  createStartHandler({ createRouter }),
  defaultStreamHandler,
);
```

### `src/app/client.tsx` – Client Sentry Init

```tsx
import * as Sentry from '@sentry/tanstackstart-react';
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start';
import { createRouter } from './router';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  integrations: [
    Sentry.tanstackRouterBrowserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

const router = createRouter();

hydrateRoot(document, <StartClient router={router} />);
```

### Sentry Error Boundary

```tsx
// src/app/routes/__root.tsx (add to error handling)
import * as Sentry from '@sentry/tanstackstart-react';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: ({ error }) => (
    <Sentry.ErrorBoundary fallback={<ErrorPage error={error} />}>
      <ErrorPage error={error} />
    </Sentry.ErrorBoundary>
  ),
});
```

### Route-level Sentry example

```tsx
// src/app/routes/sentry-example/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import * as Sentry from '@sentry/tanstackstart-react';

export const Route = createFileRoute('/sentry-example/')({
  component: SentryExamplePage,
});

function SentryExamplePage() {
  return (
    <div>
      <h1>Sentry Example</h1>
      <button
        onClick={() => {
          throw new Error('Sentry test error');
        }}
      >
        Throw Error
      </button>
      <button
        onClick={() => {
          Sentry.captureMessage('Test Sentry message', 'info');
        }}
      >
        Capture Message
      </button>
    </div>
  );
}
```

---

## 2. Sentry Vite Plugin

Already added in Phase 1 (`vite.config.ts`):

```ts
sentryVitePlugin({
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    filesToDeleteAfterUpload: ['**/*.js.map'],
  },
});
```

Source maps are uploaded to Sentry during `pnpm build`. No separate configuration needed.

---

## 3. Pino Server Logging

### No changes to existing logger files

`src/core/logger/server.ts` is reused as-is. The Pino logger is Node.js-based and works identically in TanStack Start's Nitro/Node server.

### Logger usage in middleware

```ts
// Request middleware
import { logger } from '@/core/logger/server';

const loggingMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const start = Date.now();
    logger.info({ url: request.url, method: request.method }, 'Request');
    const response = await next();
    logger.info(
      { status: response.status, ms: Date.now() - start },
      'Response',
    );
    return response;
  },
);
```

### Logger usage in server functions

```ts
import { logger } from '@/core/logger/server';

export const someAction = createSecureServerFn({
  schema: z.object({}),
  handler: async ({ context }) => {
    logger.info({ userId: context.session.user.id }, 'Action executed');
    // ...
  },
});
```

---

## 4. Log Ingest API Route

Browser logs are sent to a server-side endpoint that proxies to Logflare. This replaces the Next.js `api/logs/route.ts`.

### `src/app/routes/api/logs/route.tsx`

```tsx
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { env } from '@/core/env';
import { responseService } from '@/shared/lib/api/response-service';

export const APIRoute = createAPIFileRoute('/api/logs')({
  POST: async ({ request }) => {
    const secret = request.headers.get('x-log-ingest-secret');
    if (!env.LOG_INGEST_SECRET || secret !== env.LOG_INGEST_SECRET) {
      return responseService.unauthorized();
    }

    const body = await request.json();

    // Forward to Logflare
    if (env.LOGFLARE_API_KEY && env.LOGFLARE_SOURCE_TOKEN) {
      await fetch('https://api.logflare.app/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': env.LOGFLARE_API_KEY,
        },
        body: JSON.stringify({
          source: env.LOGFLARE_SOURCE_TOKEN,
          log_entry: body,
        }),
      });
    }

    return responseService.noContent();
  },
});
```

---

## 5. Sentry + Server Functions

Server function errors are automatically captured by Sentry when using `wrapStartHandler`. For explicit capture in server functions:

```ts
import * as Sentry from '@sentry/tanstackstart-react';

export const riskyAction = createSecureServerFn({
  schema: z.object({}),
  handler: async ({ context }) => {
    try {
      return await doRiskyThing();
    } catch (error) {
      Sentry.captureException(error, {
        user: { id: context.session.user.id },
        tags: { action: 'risky-action' },
      });
      throw error;
    }
  },
});
```

---

## 6. Sensitive Data Scrubbing

Security rule: **never log or send to Sentry any sensitive user data**.

### In Pino server logger

```ts
// src/core/logger/server.ts
export const logger = pino({
  redact: [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    '*.password',
    '*.token',
    '*.secret',
  ],
});
```

### In Sentry `beforeSend`

Already included in the server init (see above) – removes `authorization` and `cookie` headers.

---

## 7. Performance Monitoring

TanStack Router has native Sentry integration:

```ts
// Automatic route-change performance monitoring
Sentry.tanstackRouterBrowserTracingIntegration();
```

This captures page loads and navigation transitions as Sentry performance transactions.

Custom spans in server functions:

```ts
import * as Sentry from '@sentry/tanstackstart-react';

handler: async ({ data }) => {
  return Sentry.startSpan({ name: 'db.query.getUsers', op: 'db' }, async () => {
    return db.select().from(users);
  });
};
```

---

## Risks

| Risk                                                                                        | Severity      | Mitigation                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `@sentry/tanstackstart-react` is a newer package (March 2026) – API may change              | MAJOR         | Pin version `^10.45.0`; test before each dependency update                                           |
| `Sentry.wrapStartHandler` behavior with streaming responses                                 | MINOR         | Test with `defaultStreamHandler`; Sentry is an official TanStack Start partner and should support it |
| Pino `redact` array must be kept current as new log fields are added                        | MINOR         | Code review checklist: any new log field with sensitive data must be in redact list                  |
| Client Sentry DSN exposed via `VITE_SENTRY_DSN` – this is expected and fine (DSN is public) | INFORMATIONAL | DSN is designed to be public; project-level rate limiting in Sentry dashboard                        |

---

## Validation

Phase 9 is complete when:

- [ ] `pnpm dev` starts without Sentry errors
- [ ] Client-side JavaScript errors are captured in Sentry
- [ ] Server-side errors (in server functions) are captured in Sentry
- [ ] Route navigation appears in Sentry performance traces
- [ ] Source maps are uploaded during `pnpm build` (requires `SENTRY_AUTH_TOKEN`)
- [ ] `/api/logs` endpoint accepts POST requests with correct secret
- [ ] Pino server logger outputs structured JSON in development
- [ ] No sensitive data (password, token, cookie) appears in Pino logs
- [ ] `pnpm typecheck` passes
