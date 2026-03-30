# Enterprise Security Architecture

This document provides a comprehensive overview of the **Enterprise Security Architecture** implemented in this boilerplate. It follows a "secure-by-default" philosophy, integrating **Next.js 16**, **React 19**, and **Clerk Authentication**.

## 1. Core Architecture

The security model is built on three main pillars:

1.  **Unified Security Context**: A shared data structure available across all execution layers.
2.  **Layered Middleware Pipeline**: A composable request filtering system.
3.  **Secure Action Wrapper**: A hardened interface for all server-side mutations.

### 1.1 Runtime Boundary (Required Reading)

Before extending middleware, auth flow, or authorization wiring, read these two documents:

- Architecture source of truth: `docs/architecture/15 - Edge vs Node Composition Root Boundary.md`
- Developer implementation playbook: `docs/usage/04 - Extending App Safely - Edge vs Node Authorization.md`

This split is mandatory:

- **Edge middleware** (`src/proxy.ts`) handles request-gate concerns only.
- **Node runtime** handles DB-backed RBAC/ABAC authorization.

---

## 2. Security Context & Authorization

The `SecurityContext` provides a unified view of the current request, user, and environment.

### 2.1 Security Context Helper

Use `getSecurityContext()` in **Server Components**, **Server Actions**, or **Route Handlers** to retrieve identity and request metadata.

```typescript
import { getSecurityContext } from '@/security/core/security-context';

const context = await getSecurityContext(dependencies);
// context.user contains: { id, tenantId, attributes? }
// context.readinessStatus: 'ALLOWED' | 'BOOTSTRAP_REQUIRED' | 'ONBOARDING_REQUIRED' | ...
// context.ip, context.correlationId, context.runtime, context.environment
```

`SecurityContext` does **not** contain role information. Roles are resolved through the authorization domain. Identity context (`user.id`, `user.tenantId`) is the only user data available here.

### 2.2 RBAC & Tenant Isolation

The authorization engine enforces access control based on roles and tenant ownership through the `AuthorizationFacade` and `AuthorizationService`.

```typescript
import { AuthorizationFacade } from '@/security/core/authorization-facade';
import type { AuthorizationService } from '@/core/contracts/authorization';

const facade = new AuthorizationFacade(authorizationService);

// Throws AuthorizationError if the policy denies access
await facade.authorize({
  tenant: { tenantId: context.user.tenantId },
  subject: { id: context.user.id },
  resource: { type: 'settings', id: resourceId },
  action: 'update',
  environment: { ip: context.ip, time: new Date() },
});
```

In practice, authorization is handled automatically by `createSecureAction` — direct facade usage is only needed in Route Handlers or Server Components that perform their own policy checks.

---

## 3. Middleware Pipeline

The application uses a modular pipeline in `src/proxy.ts` (Next.js 16 Middleware replacement) to process every request.

### 3.1 Security Guards

- **Route Classification**: Categorizes routes (API, Public, Auth, Internal) to apply specific policies.
- **Security Headers**: Applies CSP, HSTS, X-Frame-Options, and more via `withHeaders`.
- **Internal API Guard**: Blocks external access to `/api/internal/*` using `INTERNAL_API_KEY`.
- **Rate Limiting**: Integrated Upstash/In-memory protection via `withRateLimit`.
- **Auth Guard**: Orchestrates Clerk authentication and onboarding redirects.

### 3.2 Global Headers (CSP)

A hardened **Content Security Policy** is enforced by default, including specific rules for Clerk integration.

---

## 4. Secure Server Actions

To prevent the most common Next.js security pitfalls, all mutations must use the `createSecureAction` wrapper.

### 4.1 Features

- **Strict Validation**: Enforces Zod schemas.
- **Auto-Authorization**: Checks roles before execution.
- **Audit Logging**: Logs every success and failure with structured metadata.
- **Replay Protection**: Validates timestamps to prevent duplicate submissions.
- **Hidden Field Safety**: Derives sensitive IDs (like `userId`) from the session, never from client input.

### 4.2 Example Usage

```typescript
// features/example/actions.ts
'use server';

import { z } from 'zod';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { createSecureAction } from '@/security/actions/secure-action';
import { createSecurityContext } from '@/security/core/security-context';
import type { NodeSecurityContextDependencies } from '@/security/core/security-dependencies';

const schema = z.object({
  title: z.string().min(5),
});

function createSecurityDependencies() {
  const requestContainer = getAppContainer().createChild();
  const securityContextDependencies: NodeSecurityContextDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
    userRepository: requestContainer.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
    ),
  };
  return {
    getSecurityContext: () =>
      createSecurityContext(securityContextDependencies),
    authorizationService: requestContainer.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    ),
  };
}

export const updateSettings = createSecureAction({
  schema,
  resource: { type: 'settings' }, // Optional: scopes policy evaluation to this resource type
  dependencies: createSecurityDependencies, // Required: resolved per-request via DI
  handler: async ({ input, context }) => {
    // context.user.id is derived from the session, never from client input
    return await db.settings.update(context.user!.id, input);
  },
});
```

Key points:

- `dependencies` is **required** — it wires `getSecurityContext` and `authorizationService` via the DI container
- `resource` and `action` are optional; omitting them applies a default system-level policy check
- There is no `role` field — authorization is policy-based, not role-based at the action level
- `context.user` may be `undefined` if unauthenticated; the wrapper returns `{ status: 'unauthorized' }` before reaching the handler

---

## 5. Advanced Protections

### 5.1 SSRF Protection (`secureFetch`)

Prevents **Server-Side Request Forgery** by validating outbound URLs against an allowlist and blocking private IP ranges.

```typescript
import { secureFetch } from '@/security/outbound/secure-fetch';

// This will fail if the host is not in ALLOWED_HOSTS or is a local IP
const response = await secureFetch('https://api.trusted-partner.com/data');
```

### 5.2 RSC Data Sanitization

Prevents sensitive data leakage during React Server Component hydration.

```typescript
import { sanitizeData, toDTO } from '@/security/rsc/data-sanitizer';

const rawUser = await db.user.findFirst();

// Automatically removes fields like 'password', 'token', 'secret'
const safeUser = sanitizeData(rawUser);

// Or use a DTO for explicit field selection
const userDTO = toDTO(rawUser, ['id', 'email', 'name']);
```

---

## 6. Observability & Logging

### 6.1 Security Audits

Mutations are logged to the server console (and Logflare in production) with the `SECURITY_AUDIT` type.

### 6.2 Critical Events

High-severity events (SSRF attempts, tenant violations) are logged with `SECURITY_EVENT` and marked as `fatal` for immediate alerting.

```typescript
import { logSecurityEvent } from '@/security/utils/security-logger';

await logSecurityEvent({
  event: 'tenant_violation',
  context,
  metadata: { attemptedTenantId: 'mismatch_123' },
});
```

---

## 7. Configuration

Manage security settings via [./src/core/env.ts](@/core/env.ts):

| Variable                     | Description                                |
| ---------------------------- | ------------------------------------------ |
| `INTERNAL_API_KEY`           | Secret key for `/api/internal` routes.     |
| `SECURITY_AUDIT_LOG_ENABLED` | Toggle structured audit logging.           |
| `LOG_INGEST_SECRET`          | Secret for secure log ingestion endpoints. |

### 7.1 Generating Secrets

For production, you must use strong, unique keys for `INTERNAL_API_KEY` and `LOG_INGEST_SECRET`. You can generate them using the provided utility script:

```bash
# Generate a 64-character secure secret
pnpm generate:secret

# Or specify a different length (32, 48, or 64)
pnpm generate:secret --length 32
```
