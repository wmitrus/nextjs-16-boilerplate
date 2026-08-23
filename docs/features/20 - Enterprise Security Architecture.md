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

### 3.2 Error Boundary — A Thrown Request Is Still A Hardened Response (SEC-45)

The pipeline's error boundary lives **inside `withSecurity`**, wrapping the
composed handler, not at the proxy's outer `catch`:

```ts
let response: NextResponse;
try {
  response = await handler(request, ctx);
} catch (error) {
  logger.error({ correlationId: ctx.correlationId, ... }, 'Security pipeline threw');
  response = createServerErrorResponse('Internal Server Error', 500, 'SERVER_ERROR');
}
response = withHeaders(request, response, ctx.nonce);   // one path for every response
response.headers.set('x-correlation-id', ctx.correlationId);
response.headers.set('x-request-id', ctx.requestId);
```

**Why it was wrong before.** The 500 was built in the proxy's catch, _outside_
the function that applies `withHeaders()` — so a throw anywhere in the chain
produced the one response in the application with no CSP, no `nosniff`, no
framing protection and no correlation id, logged through `console.error`
instead of the structured edge logger. Worse, the hardening chain then existed
in two places: adding a header to `withSecurity` would have hardened every
response except the failure one.

**Three rules that follow:**

| Rule                                                         | Why                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Boundary at the innermost frame holding `RouteContext`       | It is the last place with `ctx.correlationId`; a catch further out must invent a second id that joins to nothing, and duplicate the finalization |
| Body generic in **every** environment — no `NODE_ENV` branch | The boundary runs before any authorization, so the throw can come from any library and carry paths, table names or connection strings            |
| Correlation in headers, never in the body                    | `ServerErrorResponse` is shared by every error in the app; widening it for one path changes a contract the whole API depends on                  |

The proxy keeps a last-resort catch for throws that never reach `withSecurity`
(`classifyRequest()` failing, container wiring). It returns a hardened generic
500 and **deliberately mints no correlation id** — there is no context to take
one from, and a fresh id would be a promise the logs cannot keep.

Enforced by `src/proxy.test.ts`, which throws a connection string from a
middleware and asserts the 500 carries the full header set and leaks no
fragment of it.

### 3.3 Global Headers (CSP)

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

### 5.3 Internal API Guard (`/api/internal/**`)

Shared-key authentication, hardened in **SEC-44**. Four properties, each
present for a reason the code states:

| Property                             | Why                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dedicated failed-auth counter**    | `withInternalApiGuard` is composed _before_ `withRateLimit`, so a rejected key returned 403 without the limiter ever running — key guessing was unmetered. The ordering is correct (an unauthenticated caller must not spend a legitimate client's API allowance), so rejections get their own counter instead of a pipeline reorder. |
| **Constant-time verification**       | `!==` on a string leaks both the position of the first differing byte and the length of a guess. `crypto.timingSafeEqual` is Node-only and this guard runs in **Edge**, so both sides are digested with `crypto.subtle` and compared with an accumulating XOR.                                                                        |
| **`current + previous` rotation**    | A single key meant every caller had to cut over in the same instant. Both are accepted; the guard logs `internal_api:previous_key_used` so an unretired old key is visible.                                                                                                                                                           |
| **32-character floor in production** | `z.string().min(1)` made a one-character key a valid production configuration. Enforced by `validateInternalApiKeyConfigValues`, at startup rather than on first request.                                                                                                                                                             |

**The counter deliberately does not fail closed** — unlike SEC-42's strict
rate limiter. `/api/internal/health` and `/api/internal/env-check` exist to be
called _during_ an incident, so denying a **correct** key because Redis is
unreachable would remove the operator's diagnostic exactly when it is needed.
The key check is unaffected either way, so a counter outage weakens
brute-force protection rather than admitting anyone. Full reasoning: SEC-44 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md`.

**Request signing (HMAC + replay window) and mTLS are deliberately not
implemented.** The repository has no production service-to-service consumer of
these routes; building that protocol now would mean a nonce store, clock-skew
tolerance and a second auth path that nothing exercises. Tracked as `PE-19`…
`PE-21` in `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` with an explicit
trigger: the first real production consumer, or an internal endpoint whose
impact warrants per-request authentication.

### 5.4 Diagnostics Never Carry Secret Material

`getEnvDiagnostics()` reports `{ name, present }` and nothing else.

It previously included `maskedValue` = `value.slice(0,2) + '***' +
value.slice(-4)`, which handed fragments of `CLERK_SECRET_KEY` and of
`INTERNAL_API_KEY` itself to `/api/internal/env-check` **and** to the
`/env-summary` demo page — the latter reachable by any signed-in user with
demo mode on. The field was removed at the `EnvDiagnosticsEntry` source rather
than from one route's JSON, because the second consumer is the one that gets
forgotten.

A masked secret is still a secret in an HTTP response. Diagnosing a broken
deployment needs to know _whether_ a variable is set; it never needs any part
of its value.

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

### 6.3 DB-Backed Audit Trail

Both `logActionAudit` and `logSecurityEvent` above (plus every `/api/admin/**`
mutation route) also write to a second, DB-backed sink: `audit_events`. Unlike
the Pino/Logflare output in 6.1/6.2, this trail is queryable in-app
(`/admin/security/audit-logs`), admin-toggleable per category at runtime (no
redeploy), and retention-governed by a scheduled purge job — the table does
not grow unbounded. Fail-open: a write failure to this sink never affects the
underlying request. Full design, category taxonomy, and retention details:
[36 - Audit Logging & Retention.md](./36%20-%20Audit%20Logging%20%26%20Retention.md).

---

## 7. Configuration

Manage security settings via [./src/core/env.ts](@/core/env.ts):

| Variable                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTERNAL_API_KEY`           | Shared secret for `/api/internal` routes. **Minimum 32 characters when `NODE_ENV=production`** (SEC-44); generate with `openssl rand -base64 32` or `pnpm generate:secret`. Leaving it unset is a valid, safe configuration — the guard then refuses every internal request.                                                                                                                                                                                               |
| `INTERNAL_API_KEY_PREVIOUS`  | The key being rotated out, accepted alongside the current one so a cutover needs no flag day (SEC-44). Must differ from `INTERNAL_API_KEY` and meets the same length floor. Remove it once `internal_api:previous_key_used` stops appearing in the logs.                                                                                                                                                                                                                   |
| `DEPLOYMENT_PROXY`           | Which ingress may determine the client IP: `vercel \| cloudflare \| trusted-proxy \| none` (SEC-43). **Required when `NODE_ENV=production`**; defaults to `none` in development and test. Deliberately never inferred from `VERCEL_ENV`.                                                                                                                                                                                                                                   |
| `TRUSTED_PROXY_CIDRS`        | Comma-separated CIDRs of your own proxies. Required only for `DEPLOYMENT_PROXY=trusted-proxy`.                                                                                                                                                                                                                                                                                                                                                                             |
| `RATE_LIMIT_STRICT_DEGRADE`  | Deploy-time base for the strict-rate-limit degrade switch (SEC-42). Leave `false`; the runtime lever is the `strict_rate_limit_degrade` feature flag.                                                                                                                                                                                                                                                                                                                      |
| `SECURITY_AUDIT_LOG_ENABLED` | Defined in the env schema; not currently read by `logActionAudit`/`logSecurityEvent`/`recordAdminAuditEvent` or anywhere else in `src/security/` — pre-existing drift between this description and the code, not something the DB-backed audit trail (§6.3) depends on or introduced. Per-category on/off for that trail is controlled by admin-managed DB settings instead — see [36 - Audit Logging & Retention.md](./36%20-%20Audit%20Logging%20%26%20Retention.md) §4. |
| `LOG_INGEST_SECRET`          | Secret for secure log ingestion endpoints.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### 7.1 Generating Secrets

For production, you must use strong, unique keys for `INTERNAL_API_KEY` and `LOG_INGEST_SECRET`. You can generate them using the provided utility script:

```bash
# Generate a 64-character secure secret
pnpm generate:secret

# Or specify a different length (32, 48, or 64)
pnpm generate:secret --length 32
```
