# Repository AI Context

## Project identity

This repository is a production-grade **Next.js 16 TypeScript boilerplate** designed as a **modular monolith** for long-term reuse across multiple applications.

It is not demo code and must not be treated as a rapid-prototype repository.

Primary goals:

- preserve modular monolith boundaries
- maintain contract-first design
- keep DI / composition root discipline
- isolate provider-specific integrations
- centralize security-sensitive enforcement
- remain ready for future tenancy / organizations
- remain ready for RBAC / ABAC evolution
- remain ready for feature flags
- remain compatible with Vercel-hosted App Router deployments
- maintain production-grade observability and low-blast-radius evolution

---

## Core architectural model

Top-level source layout:

- `src/app` = delivery layer (App Router pages, layouts, route handlers, framework entrypoints)
- `src/core` = stable foundation (contracts, DI container, env, logger, shared technical primitives)
- `src/features` = product-facing feature composition
- `src/modules` = isolated business/integration modules
- `src/security` = centralized security runtime and enforcement
- `src/shared` = neutral reusable building blocks
- `src/testing` = test infrastructure and support

Expected dependency direction:

- `app -> features/modules/security/shared/core`
- `features -> modules/security/shared/core`
- `modules -> shared/core`
- `security -> shared/core`
- `shared -> core`
- `core` must not depend on `app/features/security/modules`

Approved exception:

- composition root / container registration in `src/core/container/*`

---

## Source of truth rule

The live repository code is the source of truth.

Docs, diagrams, reports, and AI summaries are secondary and may drift.

If code and docs disagree:

- trust the code
- explicitly report the drift
- do not silently reconcile the difference
- do not present doc claims as facts unless verified in code

---

## Current known repository characteristics

The repository currently includes:

- Next.js 16 App Router
- React 19
- TypeScript strict mode
- Tailwind CSS 4
- Clerk authentication
- Sentry integration
- Upstash rate limiting
- request-scoped security composition
- centralized proxy/security pipeline
- modular contracts under `src/core/contracts/*`
- DI container under `src/core/container/*`
- auth provider adapters under `src/modules/auth/*`
- authorization domain under `src/modules/authorization/*`

Known practical reality:

- architecture docs are strong, but some docs may be stale relative to live files
- request-scoped composition exists, but some paths may still use more global/container-style resolution
- tenancy seams exist, but tenant hardening is not yet fully mature
- feature-flag readiness is partial, not fully implemented as a first-class subsystem

---

## Architectural non-negotiables

Never approve or introduce:

- business logic inside `shared/*`
- reverse dependency from `core` to higher layers outside approved composition-root exceptions
- provider SDK leakage into domain/core contracts
- authorization enforced only in UI
- ad hoc role or tenant logic scattered across unrelated files
- security-critical logic moved to client components without necessity
- middleware as the sole protection for sensitive mutations
- cache behavior that can leak user- or tenant-specific data
- hidden service-locator patterns in request-sensitive flows
- broad refactors without clear architectural justification

---

## Security and trust model

Important assumptions:

- authentication, authorization, and tenancy are separate concerns
- trust boundaries must be explicit
- server-side enforcement is mandatory for sensitive behavior
- tenant/org context must come from trustworthy server-side derivation
- provider-specific concerns must stay isolated in adapters/framework boundaries
- sensitive data must not leak through logs, telemetry, responses, or client bundles

---

## Runtime model

AI agents must reason explicitly about:

- App Router boundaries
- server vs client components
- server actions
- route handlers
- proxy/middleware responsibilities
- edge vs node runtime behavior
- request-time vs build-time behavior
- caching and revalidation
- Vercel deployment implications
- public vs non-public env exposure

---

## Future extensibility expectations

The repository should evolve safely toward:

- stronger RBAC
- ABAC
- tenant / organization-aware behavior
- per-tenant feature flags
- request-scoped caching
- worker/background runtime entrypoints

AI must judge whether current boundaries make those futures easier or harder.

---

## AI governance files

Before performing architectural, security, or runtime analysis, AI agents should read:

- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

Canonical-path clarification:

- the live repository protocol file is `docs/ai/general/00 - Agent Interaction Protocol.md`
- some prompts may still refer to `docs/ai/AGENT_PROTOCOL.md` or `docs/ai/00 - Agent Interaction Protocol.md`; treat those as stale paths, not as separate sources of truth

These files define:

- repository identity
- non-negotiable rules
- agent authority boundaries
- conflict resolution model
