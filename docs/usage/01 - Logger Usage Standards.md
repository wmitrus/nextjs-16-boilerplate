# Logger Usage Standards

## Overview

This document defines standardized patterns for logging throughout the Next.js 16 boilerplate. All logging must follow the **child logger pattern** to ensure consistent metadata, improve observability, and reduce duplication.

---

## Child Logger Pattern

Every module should create a child logger with explicit metadata describing its context. This ensures logs are properly tagged and searchable.

### Basic Structure

```typescript
import { logger as baseLogger } from '@/core/logger/server'; // or '@/core/logger/edge'

const logger = baseLogger.child({
  type: 'ModuleType', // Main category
  category: 'subcategory', // Specific functionality
  module: 'file-name', // Source file identifier
});
```

### Properties

- **`type`** - Broad classification (e.g., `'Security'`, `'API'`, `'Feature'`, `'Database'`)
- **`category`** - Specific subsystem (e.g., `'rate-limit'`, `'error-handling'`, `'authentication'`)
- **`module`** - Source file name (e.g., `'with-rate-limit'`, `'userService'`)

---

## Logger Imports

### Server Runtime

```typescript
import { logger as baseLogger } from '@/core/logger/server';
```

Use in:

- Server actions (`.ts` files in `src/app`)
- API route handlers
- Server-side utilities
- Database services

### Edge Runtime

```typescript
import { logger as baseLogger } from '@/core/logger/edge';
```

Use in:

- Middleware functions
- Edge runtime handlers
- API proxies

### Isomorphic (Auto-Select)

```typescript
import { logger as baseLogger } from '@/core/logger';
```

Use in:

- Shared utilities (automatically selects based on runtime)
- **Not recommended** - be explicit about runtime context

---

## Log Levels

### `debug` - Development & Troubleshooting

**Use for:** Detailed information useful during development and debugging.

```typescript
logger.debug({ userId: user.id, input }, 'Processing user data');
```

**Characteristics:**

- Only visible in development or with `LOG_LEVEL=debug`
- Safe to log sensitive operation details
- Helps trace execution flow

### `warn` - Notable Issues

**Use for:** Situations that should be monitored but don't prevent operation.

```typescript
logger.warn({ ip, limit, remaining }, 'Rate limit approaching threshold');
```

**Characteristics:**

- Visible in most environments
- Indicates potential problems
- Examples: rate limit warnings, deprecations, unusual patterns

### `error` - Critical Issues

**Use for:** Errors that require attention and fix.

```typescript
logger.error({ err, path, correlationId }, 'Failed to process request');
```

**Characteristics:**

- Always visible
- Indicates failures
- May include stack traces
- Triggers alerts in production monitoring

### `info` - Avoid (Rarely Used)

**Avoid using `logger.info()`** except for:

- Application startup messages
- Significant state changes (e.g., service initialization)
- Environment-specific information

```typescript
// Acceptable: Application startup
logger.info({ version, environment }, 'Server starting');
```

---

## Common Patterns

### API Route Handler

```typescript
import { logger as baseLogger } from '@/core/logger/server';
import { createSuccessResponse } from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

const logger = baseLogger.child({
  type: 'API',
  category: 'users',
  module: 'users-route',
});

export const GET = withErrorHandler(async (request) => {
  const correlationId = request.headers.get('x-correlation-id') || 'unknown';

  logger.debug(
    { correlationId, path: request.nextUrl.pathname },
    'Fetching users',
  );

  const users = await fetchUsers();

  return createSuccessResponse(users);
});
```

### Security Middleware

```typescript
import { logger as baseLogger } from '@/core/logger/edge';
import { createServerErrorResponse } from '@/shared/lib/api/response-service';

const logger = baseLogger.child({
  type: 'Security',
  category: 'rate-limit',
  module: 'with-rate-limit',
});

export async function withRateLimit(req: NextRequest, correlationId: string) {
  const ip = await getIP(req.headers);
  const result = await checkRateLimit(ip);

  if (!result.success) {
    logger.warn(
      {
        type: 'SECURITY_AUDIT',
        ip,
        correlationId,
        path: req.nextUrl.pathname,
        limit: result.limit,
        remaining: result.remaining,
      },
      'Rate limit exceeded',
    );

    return createServerErrorResponse(
      'Rate limit exceeded. Please try again later.',
      429,
      'RATE_LIMITED',
    );
  }

  return null;
}
```

### Server Action with Audit Logging

```typescript
import { logger as baseLogger } from '@/core/logger/server';

const logger = baseLogger.child({
  type: 'Security',
  category: 'mutations',
  module: 'update-profile-action',
});

export async function updateProfile(input: UpdateProfileInput) {
  const context = await getSecurityContext();

  logger.debug(
    { userId: context.user?.id, action: 'updateProfile' },
    'Starting profile update',
  );

  try {
    const result = await db.user.update({
      /* ... */
    });

    logger.debug(
      { userId: context.user?.id, updatedFields: Object.keys(input) },
      'Profile updated successfully',
    );

    return { success: true, data: result };
  } catch (error) {
    logger.error(
      {
        err: error,
        userId: context.user?.id,
        correlationId: context.correlationId,
      },
      'Failed to update profile',
    );

    throw new AppError('Failed to update profile', 500);
  }
}
```

### Error Handler Wrapper

```typescript
import { logger as baseLogger } from '@/core/logger/server';

const logger = baseLogger.child({
  type: 'API',
  category: 'error-handling',
  module: 'with-error-handler',
});

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const correlationId = request.headers.get('x-correlation-id') || 'unknown';

    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        if (error.statusCode >= 500) {
          logger.error(
            {
              correlationId,
              path: request.nextUrl.pathname,
              code: error.code,
              err: error,
            },
            'API Error (500+)',
          );
        } else {
          logger.warn(
            {
              correlationId,
              path: request.nextUrl.pathname,
              code: error.code,
            },
            'API Client Error',
          );
        }
      } else {
        logger.error(
          {
            correlationId,
            path: request.nextUrl.pathname,
            err: error,
          },
          'Unhandled API error',
        );
      }

      throw error;
    }
  };
}
```

### Client-Side Error Boundary

```typescript
'use client';

import { logger as baseLogger } from '@/core/logger/browser';

const logger = baseLogger.child({
  type: 'UI',
  category: 'error-boundary',
  module: 'client-error-boundary',
});

export function ClientErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    logger.warn(
      {
        errorMessage: error.message,
        errorName: error.name,
      },
      'Client error boundary caught'
    );
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

---

## Type & Category Conventions

### Types

- **`API`** - API routes and handlers
- **`Security`** - Security, authentication, authorization, rate limiting
- **`Feature`** - Feature-specific services (e.g., user management, onboarding)
- **`Database`** - Database queries and operations
- **`UI`** - Client-side components and error boundaries
- **`Utility`** - General utilities and helpers

### Categories

- **`error-handling`** - Error handlers and error utilities
- **`rate-limit`** - Rate limiting logic
- **`authentication`** - Auth flows
- **`mutations`** - Server action mutations
- **`queries`** - Data fetching
- **`error-boundary`** - Error boundaries
- **`validation`** - Input validation
- **`service`** - Service layer operations

---

## Best Practices

### ✅ DO

- Create one child logger per module/file
- Include correlation IDs for tracing
- Log at appropriate levels (debug for details, warn for issues, error for failures)
- Include relevant context in log metadata
- Use consistent property names across similar logs

```typescript
logger.debug(
  { userId: user.id, action: 'fetchProfile', correlationId },
  'Executing action',
);
```

### ❌ DON'T

- Log sensitive data (passwords, tokens, PII) - Pino redaction handles this
- Use `logger.info()` for regular operations - use `debug` instead
- Create new logger instances repeatedly
- Log the same information multiple times
- Use generic error messages without context

```typescript
// BAD - uses info, lacks context
logger.info('User action executed');

// GOOD - uses debug, provides context
logger.debug(
  { userId, action, timestamp: Date.now() },
  'User action completed',
);
```

---

## Metadata Convention

All logs should include a **metadata object** as the first parameter, followed by a **message string**.

```typescript
logger.LEVEL(
  {
    // Contextual data
    userId?: string;
    correlationId?: string;
    path?: string;
    err?: Error;
    [key: string]: unknown;
  },
  'Human-readable message'
);
```

---

## Integration with Observability

Logger configuration automatically:

- Sends logs to Logflare (when enabled)
- Includes environment information (staging, production)
- Tracks code revision via `VERCEL_GITHUB_COMMIT_SHA`
- Filters sensitive data via Pino redaction rules

See `src/core/logger/` for implementation details.

---

## Examples by Use Case

### Rate Limiting

```typescript
logger.warn({ ip, remaining: 5 }, 'Rate limit approaching');
logger.error({ ip, limit }, 'Rate limit exceeded');
```

### Database Operations

```typescript
logger.debug({ table: 'users', query: 'SELECT...' }, 'Executing query');
logger.error({ err, table: 'users' }, 'Database query failed');
```

### Authentication

```typescript
logger.debug({ userId, action: 'login' }, 'User login attempt');
logger.warn({ userId, reason: 'invalid_token' }, 'Auth failed');
```

### Feature Operations

```typescript
logger.debug({ userId, feature: 'onboarding' }, 'Step 1 completed');
logger.error({ err, userId, step: 1 }, 'Onboarding failed');
```

---

## Validation Checklist

When adding or refactoring logging in a module:

- [ ] Import logger from appropriate runtime (`server` or `edge`)
- [ ] Create child logger with `type`, `category`, `module`
- [ ] Use `debug` for detailed info, `warn` for issues, `error` for failures
- [ ] Avoid `logger.info()` unless absolutely necessary
- [ ] Include correlation IDs when available
- [ ] Include relevant context (user ID, path, error details)
- [ ] Run `pnpm lint` and `pnpm typecheck`
- [ ] Verify no sensitive data is logged
