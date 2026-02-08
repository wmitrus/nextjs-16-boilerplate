# Product Requirements Document (PRD) - Enterprise Security Architecture

## 1. Introduction

The goal is to implement a production-ready, enterprise-grade security architecture for the Next.js 16 application. This architecture must be "secure-by-default," composable, and compatible with the latest Next.js 16 features (App Router, RSC, Server Actions, Edge/Node runtimes).

## 2. Goals

- **Zero Feature Breakage**: Enhance security without disrupting existing functionality (Clerk auth, rate limiting, etc.).
- **Centralized Policy**: Manage security rules from a single location.
- **Unified Context**: Share security metadata across all layers (Middleware, RSC, Server Actions, API routes).
- **Hardened Defaults**: Enforce security headers, CSP, and data sanitization by default.
- **Advanced Protection**: Prevent common attacks like SSRF, CSRF, Replay, and Cross-Tenant access.

## 3. Requirements

### 3.1 Global Architecture & Middleware

- Implement a layered request security pipeline in `src/security/middleware/`.
- Composable guards: Auth, Rate Limit, Headers, Bot Detection, Geo Guard, Internal API Guard.
- Route classification: Distinguish between Public, Private, API, Webhook, and Internal routes.
- Edge/Node runtime awareness.

### 3.2 Authentication & Authorization

- Integrate with existing Clerk authentication.
- Implement a Unified Security Context (`SecurityContext`) available in all execution layers.
- Implement an Authorization Engine supporting RBAC (Role-Based Access Control) and ABAC (Attribute-Based Access Control).
- Implement a Tenant Isolation Engine to prevent cross-tenant data leakage.

### 3.3 Server Actions Security

- Create a `secure-action` wrapper to enforce:
  - Schema validation (Zod).
  - Origin validation.
  - Replay protection (nonce/timestamp).
  - Mutation logging.
  - Tenant enforcement.
- Prevent hidden field tampering by deriving sensitive data (e.g., `userId`) from the session.

### 3.4 Data & API Security

- **RSC Safe Data Layer**: Sanitize data returned from RSCs to prevent sensitive data leakage.
- **SSRF Protection**: Implement a secure outbound fetch wrapper with host allowlists.
- **Streaming Guard**: Protect against streaming abuse (chunk count, timeout).
- **Internal API Boundaries**: Secure internal-only endpoints with API keys or shared secrets.

### 3.5 Headers & Browser Security

- Automatic CSP (Content Security Policy) generator.
- Hardened default headers (X-Frame-Options, HSTS, COOP, CORP, etc.).

### 3.6 Observability

- Structured security logging for auth failures, tenant violations, replay attempts, and SSRF attempts.
- Anomaly detection for suspicious activity.

### 3.7 Runtime & Environment

- Environment access firewall to prevent client-side exposure of server-only secrets.
- Vercel-specific hardening (Preview vs. Production isolation).

## 4. Constraints

- Must use Next.js 16 async APIs (await `params`, `cookies`, etc.).
- Must be compatible with the existing `src/proxy.ts` or replace it cleanly.
- Must follow the project's T3-Env management for environment variables.
- Must be fully typed with TypeScript.

## 5. Success Criteria

- All security tests pass.
- No regression in existing features (Sign-in, Onboarding, Home page).
- `pnpm typecheck` and `pnpm lint` pass without errors.
- Security headers are correctly applied to all responses.
