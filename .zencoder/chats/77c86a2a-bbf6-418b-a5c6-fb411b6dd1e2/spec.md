# Technical Specification - Enterprise Security Architecture

## 1. Technical Context

- **Language**: TypeScript
- **Framework**: Next.js 16 (App Router), React 19
- **Authentication**: Clerk
- **Validation**: Zod
- **Infrastructure**: Vercel (Edge/Node runtimes), Upstash (Rate Limiting)

## 2. Implementation Approach

### 2.1 Unified Security Context

We will define a `SecurityContext` type and a server-side helper `getSecurityContext()` to retrieve session data, user roles, and request metadata (IP, correlation ID) consistently across Middleware, RSC, and Server Actions.

### 2.2 Middleware Pipeline

We will replace the single-function `src/proxy.ts` with a composable pipeline in `src/security/middleware/`.

- **`withSecurity`**: Main entry point.
- **`classifyRequest`**: Determines route types (public, api, internal, etc.).
- **`withAuth`**: Handles Clerk authentication and role-based redirects.
- **`withRateLimit`**: Integrates existing Upstash/Local rate limiting.
- **`withHeaders`**: Applies security headers (CSP, HSTS, etc.).
- **`withInternalApiGuard`**: Secures internal endpoints.

### 2.3 Authorization Engine

A core service in `src/security/core/authorization-facade.ts` provides a unified adapter over domain authorization:

- `AuthorizationFacade` with `can(...)` and `authorize(...)` methods.
- Role floor enforcement via `ensureRequiredRole(...)`.
- `AuthorizationError` for consistent middleware/action error handling.

### 2.4 Secure Server Actions

A wrapper `createSecureAction` in `src/security/actions/secure-action.ts`:

- Validates input with Zod.
- Checks authentication and roles.
- Validates request origin.
- Logs the mutation.
- Derives sensitive context (e.g., `userId`) from the session, never from client input.

### 2.5 SSRF Protection

`src/security/outbound/secure-fetch.ts` will provide a `secureFetch` wrapper that checks a host allowlist before making outbound requests.

## 3. Source Code Structure Changes

```text
src/
├── security/
│   ├── core/
│   │   ├── security-context.ts
│   │   ├── authorization-facade.ts
│   │   └── request-scoped-context.ts
│   ├── middleware/
│   │   ├── with-security.ts
│   │   ├── with-auth.ts
│   │   ├── with-rate-limit.ts
│   │   ├── with-headers.ts
│   │   ├── with-internal-api-guard.ts
│   │   └── route-classification.ts
│   ├── actions/
│   │   └── secure-action.ts
│   ├── outbound/
│   │   └── secure-fetch.ts
│   ├── rsc/
│   │   └── data-sanitizer.ts
│   └── utils/
│       └── ip.ts
├── proxy.ts (updated/replaced)
```

## 4. Delivery Phases

### Phase 1: Foundation & Context

- Implementation of `SecurityContext`, `authorization-facade.ts`, and `request-scoped-context.ts`.
- Definition of roles (`admin`, `user`, `guest`).

### Phase 2: Middleware Pipeline

- Implementation of `classifyRequest` and composable middleware guards.
- Migration of `src/proxy.ts` logic into the new pipeline.
- Header hardening and CSP implementation.

### Phase 3: Secure Server Actions

- Implementation of `createSecureAction` wrapper.
- Replay protection logic.

### Phase 4: Advanced Protection & Observability

- `secureFetch` (SSRF protection).
- `sanitizeData` (RSC leakage prevention).
- Security logging and anomaly detection.

## 5. Verification Approach

- **Unit Tests**: Test guards, authorization logic, and action wrapper.
- **Integration Tests**: Verify middleware pipeline flow.
- **Lint/Typecheck**: Run `pnpm lint` and `pnpm typecheck`.
- **Manual Verification**: Check security headers in browser DevTools.
