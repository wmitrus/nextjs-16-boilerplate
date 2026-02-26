# 08 - Modular Monolith Architecture & File Catalog

## Purpose

This document is the **implementation guide** for the project architecture.
It explains:

- why the codebase is split into specific directories,
- how the Modular Monolith and DI model work in practice,
- how dependencies are allowed to flow,
- how to add new modules/features safely,
- and what every runtime/support file is responsible for.

This is intended to be a production-ready onboarding document for engineers extending the app.

---

## 1) Architecture in one page

### 1.1 System style

This codebase uses a **Modular Monolith**:

- One deployable application.
- Multiple isolated domain modules.
- Shared infrastructure and cross-cutting concerns.
- Strict dependency flow rules to prevent architecture erosion.

### 1.2 Why this split exists

The split is intentional to optimize:

- **Change safety**: isolated modules reduce blast radius.
- **Testability**: DI contracts make behavior mockable.
- **Replaceability**: provider-specific adapters (for example auth provider) are isolated.
- **Scalability of team work**: module ownership is clearer.
- **Operational reliability**: security and logging are centralized cross-cutting concerns.

### 1.3 High-level layering

- `app/*` = delivery layer (routing/UI/API edges).
- `features/*` = product-facing use-case slices.
- `modules/*` = domain modules + adapters.
- `security/*` = policy enforcement and security pipeline.
- `core/*` = contracts, DI container, env, and cross-cutting infrastructure.
- `shared/*` = neutral reusable building blocks (no domain policy logic).

---

## 2) Dependency rules (must-follow)

### 2.1 Allowed direction

Dependencies should flow inward toward stable abstractions:

- `app` → `features/modules/security/shared/core`
- `features` → `modules/security/shared/core`
- `modules` → `core/shared` (and own subfolders)
- `security` → `core/shared` (and security-owned files only; module access via contracts)
- `shared` → `core` (utilities/contracts only), never module/domain policy code
- `core` → should not depend on `modules`, `security`, `features`, or `app`

### 2.2 Important constraints

- `shared/*` must remain **domain-neutral**.
- Provider-specific code (Clerk, etc.) lives in **module adapters**, not shared UI primitives.
- Business policy logic belongs in modules/security, not app routes.
- New external integrations should enter through adapters, not scattered imports.

### 2.3 Anti-patterns to avoid

- Putting RBAC/policy/tenant logic inside `shared/*`.
- Importing provider SDK directly in generic components.
- Bypassing contracts by reaching into module internals from unrelated layers.
- Adding global mutable state instead of container-managed services.

---

## 3) DI model and lifecycle

### 3.1 Core idea

The DI container in `src/core/container/index.ts` wires modules through tokens/contracts from `src/core/contracts/*`.

This gives:

- explicit interfaces,
- swappable implementations,
- controlled composition in a composition root,
- and easier unit testing with mocks.

### 3.2 Contracts and tokens

Contracts are in `src/core/contracts/*` and define app-level capabilities, for example:

- identity and tenancy,
- authorization service and repositories,
- logger abstraction.

Tokens in `src/core/contracts/index.ts` are the stable lookup keys used by the container.

### 3.3 Registration

Each module exports registration logic (`modules/auth`, `modules/authorization`, `modules/user`) to bind concrete adapters/services to contracts.

### 3.4 Runtime usage pattern

- Resolve dependencies in composition/root entry points, then pass explicit dependencies inward.
- Keep concrete provider logic inside module infrastructure.
- For cross-cutting logger concerns, use DI-aware logger access where applicable.

---

## 4) Directory purpose (why each top-level area exists)

## `src/app`

**Purpose**: framework delivery layer.

Contains Next.js routes/pages/layouts and API route edges.
It should orchestrate request/response and delegate domain/policy behavior to lower layers.

## `src/core`

**Purpose**: stable foundation.

Contains contracts, container, env schema, logger infrastructure, and other cross-cutting primitives.
This is the foundation modules build on.

## `src/modules`

**Purpose**: isolated business modules with explicit boundaries.

- `modules/auth` isolates authentication provider integration.
- `modules/authorization` isolates permissions/policy domain logic.
- `modules/user` isolates user-domain data and access contracts.

Modules are the primary place to add new domain capabilities.

## `src/security`

**Purpose**: centralized policy enforcement and hardening.

Contains middleware pipeline, secure actions, outbound protection, and sanitization.
Security rules are enforced consistently in one place rather than duplicated.

## `src/features`

**Purpose**: user-facing vertical capabilities.

Features compose reusable pieces from modules/security/shared to deliver concrete product behavior.

## `src/shared`

**Purpose**: neutral reusable assets.

Contains generic components, hooks, helpers, and types with no domain policy ownership.

## `src/testing`

**Purpose**: non-test runtime support for tests.

Contains factories and infrastructure mocks used across suites to keep test setup consistent.

---

## 5) Request flow and responsibility map

### 5.1 HTTP/API request

1. Request enters through `app` route or proxy.
2. Security middleware pipeline classifies route and applies guards/rate-limit/headers with request-scoped dependencies.
3. Route delegates to feature/module services.
4. Cross-cutting concerns (logging/errors) are handled through shared/core infrastructure.
5. Response is returned via standardized API response helpers.

### 5.2 UI interaction flow

1. UI in `app`/`features` triggers actions.
2. Action wrappers apply security/audit/replay protections.
3. Domain decisions come from module services (auth/authorization).
4. Shared components render neutral UI primitives.

---

## 6) How to add new functionality correctly

### 6.1 Add a new feature (recommended sequence)

1. Define feature scope in `features/<feature-name>`.
2. Reuse existing module contracts/services where possible.
3. If new domain capability is needed, add or extend a module in `modules/*`.
4. Keep provider SDK usage in module infrastructure adapters.
5. Expose only necessary interfaces upward.
6. Add tests at unit/integration boundaries.

### 6.2 Add a new module

1. Create `src/modules/<module>/index.ts` with `register(container)`.
2. Define/extend required contracts under `src/core/contracts/*`.
3. Implement domain + infrastructure subfolders.
4. Register module in bootstrap container.
5. Add mocks/adapters for tests in `src/testing/infrastructure` if needed.
6. Validate dependency direction and lint/type/test gates.

### 6.3 Add new env variables

1. Add to `src/core/env.ts` schema (server/client + runtimeEnv).
2. Update `.env.example`.
3. Run env consistency checks.
4. Keep secrets server-only unless explicitly public.

### 6.4 Add new security behavior

1. Prefer extending `security/middleware` composition or `security/actions` wrappers.
2. Keep rules centralized and reusable.
3. Avoid route-local ad hoc security logic unless absolutely necessary.

---

## 7) Production readiness checklist for architecture changes

Before merging architectural changes:

- [ ] Dependency direction still follows this document.
- [ ] No domain logic leaked into `shared/*`.
- [ ] New provider-specific code is isolated in adapters.
- [ ] DI contracts/tokens are explicit and testable.
- [ ] Env schema and `.env.example` are in sync.
- [ ] Unit/integration/e2e pathways are still valid.
- [ ] Logging/error handling paths remain consistent.

---

## 8) Runtime/support file catalog

This section documents each implemented runtime/support file (excluding test files).

## 8.1 Entry points, proxy, observability

- `src/proxy.ts` — global proxy/middleware entry point; assembles request-scoped security dependencies and composes route classification.
- `src/instrumentation.ts` — server-side telemetry/observability setup (Next.js instrumentation hook).
- `src/instrumentation-client.ts` — client-side telemetry/observability setup.

## 8.2 App layer (Next.js App Router)

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

## 8.3 Core layer (contracts, container, env, cross-cutting)

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

## 8.4 Modules layer

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
- `src/modules/authorization/domain/permission.ts` — compatibility re-export for permission primitives from core contracts.
- `src/modules/authorization/domain/AuthorizationService.ts` — authorization domain service.
- `src/modules/authorization/domain/policy/PolicyEngine.ts` — policy evaluation engine.
- `src/modules/authorization/infrastructure/MockRepositories.ts` — mock repositories for local/test mode.

### `modules/user`

- `src/modules/user/index.ts` — registers user module dependencies in DI.

## 8.5 Security layer

### Core and context

- `src/security/core/security-context.ts` — builds/reads security context.
- `src/security/core/security-context.mock.ts` — security context mock.
- `src/security/core/authorization-facade.ts` — centralized authorization facade for security layer decisions.
- `src/security/core/authorization-facade.mock.ts` — authorization facade mock.
- `src/security/core/request-scoped-context.ts` — request-scoped context model for authz attributes.
- `src/security/core/security-dependencies.ts` — request-scoped assembly contract/factory for security middleware and actions.

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

## 8.6 Features layer

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

## 8.7 Shared layer (neutral shared building blocks)

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

## 8.8 Testing support infrastructure (non-test runtime files)

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

## 8.9 Storybook/demo support

- `src/stories/Button.tsx` — demo Button component.
- `src/stories/Header.tsx` — demo Header component (storybook).
- `src/stories/Page.tsx` — demo Page component.
- `src/stories/Button.stories.ts` — Storybook scenarios for Button.
- `src/stories/Header.stories.ts` — Storybook scenarios for Header.
- `src/stories/Page.stories.ts` — Storybook scenarios for Page.

## 8.10 Global types

- `src/types/globals.d.ts` — global TypeScript declarations.

---

## 9) Diagram-to-code traceability matrix

The following mapping is the audit source of truth for architecture diagrams.

### 9.1 `01 - Global Dependency Rules.mmd`

- Layer anchors: `src/app/*`, `src/features/*`, `src/modules/*`, `src/security/*`, `src/shared/*`, `src/core/*`
- Runtime enforcement anchor: `src/proxy.ts`
- Composition anchor: `src/core/container/index.ts`

### 9.2 `02 - Full Module Structure.mmd`

- Delivery anchors: `src/app/*`, `src/actions/*`, `src/proxy.ts`
- Feature anchor: `src/features/security-showcase/*`
- Module anchors: `src/modules/auth/*`, `src/modules/authorization/*`, `src/modules/user/*`
- Cross-cutting anchors: `src/security/*`, `src/shared/*`
- Core anchors: `src/core/contracts/*`, `src/core/container/*`, `src/core/env.ts`, `src/core/logger/*`, `src/core/error/*`

### 9.3 `03 - Authorization Flow.mmd`

- Request entry: `src/proxy.ts`
- Middleware flow: `src/security/middleware/with-security.ts`, `src/security/middleware/with-auth.ts`
- Security context assembly: `src/security/core/security-context.ts`, `src/security/core/security-dependencies.ts`
- Decision facade: `src/security/core/authorization-facade.ts`
- Provider/repository contracts: `src/core/contracts/identity.ts`, `src/core/contracts/user.ts`, `src/core/contracts/authorization.ts`

### 9.4 `04 - Auth Provider Isolation.mmd`

- Provider adapter boundary: `src/modules/auth/infrastructure/ClerkIdentityProvider.ts`
- Module registration boundary: `src/modules/auth/index.ts`
- Contract boundary: `src/core/contracts/identity.ts`
- Contract consumers: `src/security/core/security-context.ts`, `src/security/middleware/with-auth.ts`

### 9.5 `05 - Tenant Resolution Abstraction.mmd`

- Tenant contract: `src/core/contracts/tenancy.ts`
- Provider adapter: `src/modules/auth/infrastructure/ClerkTenantResolver.ts`
- Runtime tenant usage: `src/security/core/security-context.ts`, `src/security/middleware/with-auth.ts`
- Authorization handoff: `src/security/core/authorization-facade.ts`

### 9.6 `06 - Ideal FInal Dependency Graph (strict).mmd`

- Layer anchors: `src/app/*`, `src/features/*`, `src/modules/*`, `src/security/*`, `src/shared/*`, `src/core/*`
- Composition/root anchors: `src/proxy.ts`, `src/core/container/index.ts`

### 9.7 `07 - Enterprise Grade Check Graph.mmd`

- Provider isolation checks: `src/modules/auth/infrastructure/*`, `src/core/contracts/identity.ts`
- Security runtime checks: `src/security/middleware/with-auth.ts`, `src/security/core/security-context.ts`
- Authorization boundary checks: `src/security/core/authorization-facade.ts`, `src/core/contracts/authorization.ts`
- Dependency direction checks: `src/core/contracts/*` vs `src/modules/*`

---

## 10) Quick onboarding path for new engineers

If you are new to this codebase, follow this order:

1. Read architecture diagrams 01 → 07.
2. Read sections 1–4 in this document.
3. Inspect `core/contracts`, then `core/container`.
4. Review `modules/auth` and `modules/authorization` to understand domain boundaries.
5. Review `security/middleware/with-security.ts` for runtime enforcement flow.
6. Build your first change in a feature folder using existing contracts.
7. Validate with lint/typecheck/tests before opening PR.

This sequence minimizes accidental boundary violations and helps keep the monolith modular over time.

---

## 11) Definition of done for architectural changes

A change is architecture-complete only when:

- dependency direction remains valid,
- DI contracts/tokens are updated where required,
- env/schema/docs are synchronized,
- security and logging paths are still consistent,
- tests cover new behavior at appropriate layer boundaries,
- and this document is updated if folder responsibilities changed.
