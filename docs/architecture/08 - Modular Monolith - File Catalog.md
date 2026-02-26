# 08 - Modular Monolith - File Catalog

## Document purpose

This document is a complete map of the files implementing the Modular Monolith in this repository.
It describes the role of **every implemented runtime/support file** (excluding test files), grouped by architectural layer.

> Location: `docs/architecture`, next to the architecture diagrams.

---

## 1) Entry points, proxy, observability

- `src/proxy.ts` — global proxy/middleware entry point; composes security layers and route classification.
- `src/instrumentation.ts` — server-side telemetry/observability setup (Next.js instrumentation hook).
- `src/instrumentation-client.ts` — client-side telemetry/observability setup.

---

## 2) App layer (Next.js App Router)

### API routes

- `src/app/api/internal/env-check/route.ts` — internal environment diagnostics endpoint (internal API).
- `src/app/api/internal/health/route.ts` — infrastructure/monitoring healthcheck endpoint.
- `src/app/api/logs/debug/route.ts` — helper endpoint for debug logs.
- `src/app/api/logs/route.ts` — endpoint receiving client log payloads.
- `src/app/api/security-test/ssrf/route.ts` — demo/test endpoint for SSRF protection behavior.
- `src/app/api/sentry-example-api/route.ts` — example endpoint for Sentry integration.
- `src/app/api/users/route.ts` — users API (HTTP delivery layer for user-management).

### Layouts, pages, boundaries

- `src/app/layout.tsx` — root application layout; provider composition and global shell.
- `src/app/page.tsx` — home page.
- `src/app/not-found.tsx` — global 404 page.
- `src/app/error.tsx` — app-segment error boundary.
- `src/app/global-error.tsx` — global runtime error boundary.
- `src/app/env-summary/page.tsx` — environment summary page.
- `src/app/security-showcase/page.tsx` — security mechanisms showcase page.
- `src/app/sentry-example-page/page.tsx` — sample Sentry integration page.
- `src/app/users/page.tsx` — users list page.
- `src/app/users/error.tsx` — dedicated error boundary for the users section.
- `src/app/onboarding/layout.tsx` — onboarding flow layout.
- `src/app/onboarding/page.tsx` — onboarding page.
- `src/app/sign-in/[[...sign-in]]/page.tsx` — sign-in route page.
- `src/app/sign-up/[[...sign-up]]/page.tsx` — sign-up route page.
- `src/app/waitlist/page.tsx` — waitlist page.
- `src/app/e2e-error/page.tsx` — intentionally failing page for e2e testing.
- `src/app/e2e-error/error.tsx` — error boundary for the e2e-error scenario.

### App components

- `src/app/components/layout/CopyrightYear.tsx` — copyright year component.
- `src/app/components/layout/Footer.tsx` — application footer.
- `src/app/components/sections/Hero.tsx` — landing page hero section.
- `src/app/components/sections/FeaturesGrouped.tsx` — grouped product features section.
- `src/app/components/sections/UseCases.tsx` — use-cases section.
- `src/app/components/sections/StoryOne.tsx` — narrative section #1.
- `src/app/components/sections/StoryTwo.tsx` — narrative section #2.
- `src/app/components/sections/CTA.tsx` — call-to-action section.
- `src/app/components/vercel-speed-insights.tsx` — Vercel Speed Insights UI integration.

---

## 3) Core layer (contracts, container, env, cross-cutting)

### Container and contracts

- `src/core/container/index.ts` — DI container and module bootstrap.
- `src/core/contracts/index.ts` — aggregated domain tokens/contracts.
- `src/core/contracts/primitives.ts` — primitive contracts and base types.
- `src/core/contracts/identity.ts` — identity provider contract.
- `src/core/contracts/tenancy.ts` — tenant resolution contract.
- `src/core/contracts/user.ts` — user repository contract.
- `src/core/contracts/repositories.ts` — infrastructure repository contracts.
- `src/core/contracts/authorization.ts` — authorization/policy service contracts.
- `src/core/contracts/logger.ts` — logger contract (`AppLogger`) for DI.

### Environment and error policies

- `src/core/env.ts` — environment schema/access (single source of truth for env).
- `src/core/error/ignored-rejection-patterns.ts` — centralized ignored error/rejection patterns.

### Logger (cross-cutting)

- `src/core/logger/index.ts` — logger public entry point.
- `src/core/logger/di.ts` — logger resolver through DI (server/edge).
- `src/core/logger/server.ts` — server logger implementation.
- `src/core/logger/edge.ts` — edge-runtime logger implementation.
- `src/core/logger/browser.ts` — browser logger implementation.
- `src/core/logger/client.ts` — client logger adapter.
- `src/core/logger/client-transport.ts` — transport for sending client logs to backend.
- `src/core/logger/streams.ts` — logger stream configuration.
- `src/core/logger/utils.ts` — logger helper utilities (I/O, formatting, etc.).
- `src/core/logger/logflare.ts` — Logflare integration.
- `src/core/logger/browser-utils.ts` — browser logger utilities.
- `src/core/logger/edge-utils.ts` — edge logger utilities.

---

## 4) Modules layer

### `modules/auth`

- `src/modules/auth/index.ts` — registers the auth module in the DI container.
- `src/modules/auth/infrastructure/ClerkIdentityProvider.ts` — Clerk-based identity provider adapter.
- `src/modules/auth/infrastructure/ClerkTenantResolver.ts` — Clerk-based tenant mapping adapter.
- `src/modules/auth/infrastructure/ClerkUserRepository.ts` — Clerk-based user repository adapter.
- `src/modules/auth/ui/HeaderAuthControls.tsx` — auth controls (sign-in/sign-up/user) for the header.
- `src/modules/auth/ui/HeaderWithAuth.tsx` — composes neutral header with auth controls.
- `src/modules/auth/ui/onboarding-actions.ts` — UI-layer actions for onboarding flow.

### `modules/authorization`

- `src/modules/authorization/index.ts` — registers the authorization module in DI.
- `src/modules/authorization/domain/permission.ts` — permission model and operations.
- `src/modules/authorization/domain/AuthorizationService.ts` — authorization domain service.
- `src/modules/authorization/domain/policy/PolicyEngine.ts` — policy evaluation engine.
- `src/modules/authorization/infrastructure/MockRepositories.ts` — mock repositories for local/test mode.

---

## 5) Security layer

### Core and context

- `src/security/core/security-context.ts` — builds/reads security context.
- `src/security/core/security-context.mock.ts` — security context mock.
- `src/security/core/authorization.ts` — bridge adapter between security and authorization domain.
- `src/security/core/authorization.mock.ts` — authorization adapter mock.

### Middleware composition

- `src/security/middleware/route-policy.ts` — route-level policy definitions.
- `src/security/middleware/route-classification.ts` — route classification (public/protected/internal/etc.).
- `src/security/middleware/route-classification.mock.ts` — route classification mock.
- `src/security/middleware/with-auth.ts` — auth middleware.
- `src/security/middleware/with-auth.mock.ts` — auth middleware mock.
- `src/security/middleware/with-internal-api-guard.ts` — internal API key guard middleware.
- `src/security/middleware/with-internal-api-guard.mock.ts` — internal API guard mock.
- `src/security/middleware/with-rate-limit.ts` — rate-limiting middleware.
- `src/security/middleware/with-rate-limit.mock.ts` — rate-limit middleware mock.
- `src/security/middleware/with-headers.ts` — secure HTTP headers middleware.
- `src/security/middleware/with-headers.mock.ts` — headers middleware mock.
- `src/security/middleware/with-security.ts` — security middleware pipeline composer.
- `src/security/middleware/with-security.mock.ts` — security composer mock.

### Actions, outbound, RSC

- `src/security/actions/secure-action.ts` — secure server actions wrapper.
- `src/security/actions/secure-action.mock.ts` — secure-action mock.
- `src/security/actions/action-audit.ts` — action auditing (who/what/when).
- `src/security/actions/action-replay.ts` — replay/duplication protection.
- `src/security/outbound/secure-fetch.ts` — secure fetch with SSRF protection and host allowlist.
- `src/security/outbound/secure-fetch.mock.ts` — secure-fetch mock.
- `src/security/rsc/data-sanitizer.ts` — data sanitization for RSC/UI.
- `src/security/rsc/data-sanitizer.mock.ts` — sanitizer mock.
- `src/security/utils/security-logger.ts` — dedicated security event logging.

---

## 6) Features layer

### `features/user-management`

- `src/features/user-management/api/userService.ts` — API service for user operations.
- `src/features/user-management/components/UserList.tsx` — user list presentation component.
- `src/features/user-management/types/index.ts` — user-management feature types.

### `features/security-showcase`

- `src/features/security-showcase/actions/showcase-actions.ts` — actions used by security demos.
- `src/features/security-showcase/lib/env-diagnostics.ts` — environment diagnostics for security showcase.
- `src/features/security-showcase/components/AdminOnlyExample.tsx` — admin-only view example.
- `src/features/security-showcase/components/ProfileExample.tsx` — profile operation example with access control.
- `src/features/security-showcase/components/SettingsFormExample.tsx` — secure settings form handling example.
- `src/features/security-showcase/components/InternalApiTestExample.tsx` — internal API call example.
- `src/features/security-showcase/components/ExternalFetchExample.tsx` — secure outbound fetch example.
- `src/features/security-showcase/components/EnvDiagnosticsExample.tsx` — environment diagnostics rendering example.

---

## 7) Shared layer (neutral shared building blocks)

### Components

- `src/shared/components/Header.tsx` — neutral header shell (no provider-specific logic).
- `src/shared/components/ErrorAlert.tsx` — shared error alert component.
- `src/shared/components/ui/polymorphic-element.tsx` — base polymorphic UI component.
- `src/shared/components/error/client-error-boundary.tsx` — client error boundary.
- `src/shared/components/error/global-error-handlers.tsx` — global browser error handlers.
- `src/shared/components/error/error-handler-utils.ts` — error classification/filtering utilities.

### Hooks

- `src/shared/hooks/useAsyncHandler.ts` — hook for async operation handling with state control.
- `src/shared/hooks/useHydrationSafeState.ts` — hydration-safe state hook.

### API helpers

- `src/shared/lib/api/api-client.ts` — HTTP client for API calls.
- `src/shared/lib/api/app-error.ts` — standardized app error model.
- `src/shared/lib/api/response-service.ts` — helper for building API responses.
- `src/shared/lib/api/with-error-handler.ts` — endpoint error-handling wrapper.
- `src/shared/lib/api/with-action-handler.ts` — server action handling wrapper.

### Network and rate limit

- `src/shared/lib/network/get-ip.ts` — request IP extraction utility.
- `src/shared/lib/network/get-ip.mock.ts` — IP extraction mock.
- `src/shared/lib/rate-limit/rate-limit.ts` — main rate-limit logic.
- `src/shared/lib/rate-limit/rate-limit-local.ts` — local fallback rate-limit implementation.
- `src/shared/lib/rate-limit/rate-limit-helper.ts` — integration helper for rate-limit logic.
- `src/shared/lib/rate-limit/rate-limit-helper.mock.ts` — rate-limit helper mock.

### Mocks, types, utils

- `src/shared/lib/mocks/handlers.ts` — MSW request handlers.
- `src/shared/lib/mocks/server.ts` — MSW server setup.
- `src/shared/types/api-response.ts` — shared API response types.
- `src/shared/utils/cn.ts` — CSS/Tailwind class merge helper.

---

## 8) Testing support infrastructure (non-test runtime files)

- `src/testing/index.ts` — central export for test helpers.
- `src/testing/factories/request.ts` — request object factories for tests.
- `src/testing/factories/security.ts` — security data factories.
- `src/testing/infrastructure/clerk.ts` — Clerk mocking/testing infrastructure.
- `src/testing/infrastructure/env.ts` — env manipulation helpers for tests.
- `src/testing/infrastructure/logger.ts` — logger mocking helpers for tests.
- `src/testing/infrastructure/network.ts` — network helper utilities for tests.
- `src/testing/infrastructure/next-headers.ts` — next/headers mocks.
- `src/testing/infrastructure/rate-limit.ts` — rate-limit mocks/utilities for tests.
- `src/testing/infrastructure/security-domain.ts` — security/authorization domain mocks.
- `src/testing/infrastructure/security-middleware.ts` — security middleware test helpers.

---

## 9) Storybook/demo support

- `src/stories/Button.tsx` — demo Button component.
- `src/stories/Header.tsx` — demo Header component (storybook).
- `src/stories/Page.tsx` — demo Page component.
- `src/stories/Button.stories.ts` — Storybook scenarios for Button.
- `src/stories/Header.stories.ts` — Storybook scenarios for Header.
- `src/stories/Page.stories.ts` — Storybook scenarios for Page.

---

## 10) Global types

- `src/types/globals.d.ts` — global TypeScript declarations.

---

## Alignment with architecture diagrams

This file catalog aligns with the architecture diagrams:

1. `01 - Global Dependency Rules.mmd`
2. `02 - Full Module Structure.mmd`
3. `03 - Authorization Flow.mmd`
4. `04 - Auth Provider Isolation.mmd`
5. `05 - Tenant Resolution Abstraction.mmd`
6. `06 - Ideal FInal Dependency Graph (strict).mmd`
7. `07 - Enterprise Grade Check Graph.mmd`

In practice:

- `core/*` defines contracts and cross-cutting concerns.
- `modules/*` implements domain modules and adapters.
- `security/*` contains policy enforcement and protection mechanisms.
- `shared/*` provides neutral reusable building blocks.
- `app/*` is the delivery layer (routing/UI/API edges).
