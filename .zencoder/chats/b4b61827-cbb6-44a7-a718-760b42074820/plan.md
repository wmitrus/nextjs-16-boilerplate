# TanStack Start Boilerplate – Migration Plan

## Status Legend

- [x] Completed
- [ ] Pending
- [~] Blocked – needs user input

---

## Workflow Steps

### [x] Step: Requirements

Created and finalized PRD at `.zencoder/chats/b4b61827-cbb6-44a7-a718-760b42074820/requirements.md`.

All 6 blocking points resolved. Full technology stack confirmed.

Key decisions:

- Framework: `@tanstack/react-start@^1` (v1 RC, `latest` npm tag = `1.167.3`)
- Auth: Better Auth `^1.5.6` (not Clerk)
- Sentry: `@sentry/tanstackstart-react@^10.45.0`
- Deployment: Vercel + Node.js (same codebase, config-only difference)
- SSR: Standard SSR mode (default). SPA mode documented as option.
- Storybook: Yes, `@storybook/react-vite`

---

### [x] Step: Technical Specification

Created at `.zencoder/chats/b4b61827-cbb6-44a7-a718-760b42074820/spec.md`.

Covers:

- Full file structure mapping (Next.js → TanStack Start)
- All 6 layers adapted with concrete file lists
- Security pipeline redesign (`createMiddleware` system, 2 types)
- `createSecureServerFn` wrapper replacing `createSecureAction`
- Better Auth full integration design (auth instance, session fn, API route, DI)
- Provisioning simplification (no Clerk external ID mapping)
- Composition root redesign (no edge split)
- Testing infrastructure adaptation (remove next/\*, add Better Auth mocks)
- Vite config with dual deployment target
- Sentry `@sentry/tanstackstart-react` integration
- 14 delivery phases in dependency order
- 6 risks identified with mitigations

---

### [x] Step: Planning – Migration Document Structure

After spec is approved, create `docs/tanstack-migration/` with this structure:

```
docs/tanstack-migration/
  00-overview.md              # Executive overview, goals, constraints, tech stack
  01-framework-comparison.md  # Next.js 16 vs TanStack Start – detailed diff
  02-foundation.md            # Phase 1: Scaffold, Vite config, tooling, env
  03-core-layer.md            # Phase 2: Core (DI, contracts, env, logger)
  04-db-layer.md              # Phase 3: DB layer (Drizzle, drivers, migrations)
  05-auth-module.md           # Phase 4: Better Auth module
  06-security-layer.md        # Phase 5: Security redesign (createMiddleware pipeline)
  07-authorization-module.md  # Phase 6: Authorization (RBAC/ABAC – reused domain logic)
  08-provisioning-module.md   # Phase 7: Provisioning (simplified vs Next.js version)
  09-features.md              # Phase 8: Features (user-management, security-showcase)
  10-observability.md         # Phase 9: Sentry + Pino logging
  11-testing.md               # Phase 10: Testing infrastructure
  12-cicd.md                  # Phase 11: CI/CD pipelines
  13-storybook.md             # Phase 12: Storybook integration
  14-feature-flags.md         # Phase 13: Feature flags readiness seams
  15-tenancy.md               # Phase 14: Multi-tenancy readiness seams
  BLOCKING-POINTS.md          # Live log of all blocking points and resolutions
```

---

### [x] Step: Implementation – Docs Creation

Create each migration document in `docs/tanstack-migration/`, starting with:

1. `00-overview.md`
2. `01-framework-comparison.md`
3. Each feature phase doc in order

Each doc must include:

- What the Next.js equivalent is
- What changes in TanStack Start
- Architectural decisions with rationale
- Risks and tradeoffs
- File structure changes
- Implementation order rationale
- Concrete code patterns where applicable

---

## Blocking Points Log

| ID    | Question                                                 | Status                                                                        |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| BP-01 | Deployment target (Vercel / Node / Cloudflare)?          | **RESOLVED**: Vercel + Node.js both. Zero architectural overhead.             |
| BP-02 | SPA vs SSR mode?                                         | **RESOLVED**: SSR (default, production-ready). SPA mode documented as option. |
| BP-03 | Auth provider (Clerk / Better Auth / Clerk w/ adapters)? | **RESOLVED**: Better Auth v1.5.6.                                             |
| BP-04 | Sentry TanStack Start – SDK availability?                | **RESOLVED**: `@sentry/tanstackstart-react@10.45.0` – official SDK.           |
| BP-05 | Storybook inclusion?                                     | **RESOLVED**: Yes, `@storybook/react-vite`.                                   |
| BP-06 | TanStack Start target version?                           | **RESOLVED**: v1 RC (`1.167.3`, `latest` npm tag). Build on it.               |
