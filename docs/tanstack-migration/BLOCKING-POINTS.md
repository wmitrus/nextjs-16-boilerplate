# Blocking Points Log

This document tracks all blocking points encountered during TanStack Start boilerplate planning. All points must be resolved before the relevant implementation phase begins.

---

## Status Legend

- ✅ RESOLVED
- ⛔ BLOCKED – needs user input
- 🔍 INVESTIGATING

---

## Resolved Blocking Points

### BP-01 – Deployment Target

**Question**: Where will TanStack Start apps be deployed?

**Options presented**:

- A: Vercel (Node runtime, Nitro Vercel adapter)
- B: Self-hosted Node.js
- C: Cloudflare Workers (major constraints)

**Resolution**: ✅ **Both Vercel (A) and Node.js self-hosted (B)**

**Architecture impact**: Zero. TanStack Start architecture is identical for both targets. Only `vite.config.ts` preset changes:

```ts
// Node.js
tanstackStart({ target: 'node-server' });

// Vercel
tanstackStart({ target: 'vercel' });
```

Switch controlled by `DEPLOY_TARGET` env var in CI. No design-level duplication.

**Constraints by target**:
| Concern | Vercel | Node.js |
|---|---|---|
| DB connections | Connection pooling recommended (serverless) | Persistent pool fine |
| Rate limiting | Upstash Redis (HTTP) | Upstash or in-memory |
| Cold starts | Yes | No |
| Config change | `target: 'vercel'` | `target: 'node-server'` |

**Resolved in**: `requirements.md` Phase 1

---

### BP-02 – SSR Mode

**Question**: SPA vs SSR mode?

**User concern**: "I read this is not production ready" – referring to RSC (React Server Components), not SSR.

**Resolution**: ✅ **Standard SSR (default)**

**Critical distinction**:

- **SSR** (server renders HTML, client hydrates) = production-ready, TanStack Start default ✅
- **RSC** (React Server Components) = NOT yet available in TanStack Start (being added) ❌
- **SPA mode** = no server at all, no `createServerFn`, weakens security posture ❌

The user's concern was about RSC. SSR itself is fully production-ready.

**Decision**: Build on SSR. SPA mode documented as optional, not recommended for apps with auth/security requirements.

**Resolved in**: `requirements.md` Phase 1

---

### BP-03 – Auth Provider

**Question**: Clerk / Better Auth / Clerk with adapters?

**Resolution**: ✅ **Better Auth `^1.5.6`**

**Rationale**:

- Self-hosted (no external ID mapping complexity)
- Official TanStack Start integration (`tanstackStartCookies` plugin)
- Drizzle ORM adapter built-in
- First-class option in `npm create @tanstack/start`
- Open-source, no vendor lock-in

**Architecture impact**: Eliminates `auth_user_identities`, `auth_tenant_identities` tables and the complex external ID mapping write-path.

**Resolved in**: `requirements.md` Phase 1

---

### BP-04 – Sentry SDK

**Question**: Does an official Sentry TanStack Start package exist?

**Resolution**: ✅ **`@sentry/tanstackstart-react@10.45.0`** – published March 19, 2026 by official Sentry bot.

Sentry is an official TanStack Start partner.

**Resolved in**: `requirements.md` Phase 1

---

### BP-05 – Storybook

**Question**: Include Storybook? Which adapter?

**Resolution**: ✅ **Yes, `@storybook/react-vite`**

Cleaner integration than `@storybook/nextjs` – no Next.js stubs needed. Vite is the shared build tool.

**Resolved in**: `requirements.md` Phase 1

---

### BP-06 – TanStack Start Version

**Question**: v0.x vs v1?

**User concern**: Version 1 still showing as RC in some places.

**Resolution**: ✅ **Build on `@tanstack/react-start@^1` (v1 RC)**

**Verified facts**:

- `latest` npm dist-tag = `1.167.3`
- Official statement: _"TanStack Start is currently in the Release Candidate stage! This means it is considered feature-complete and its API is considered stable."_
- v0.x is obsolete
- No v2 planned yet

**Decision**: v1 RC is the correct target. API is stable. The RC label means it is not yet called "1.0.0" final but is production-usable.

**Resolved in**: `requirements.md` Phase 1

---

## Open Blocking Points

None at this time. All 6 Phase 1 blocking points are resolved.

---

## Future Blocking Points (Anticipated)

These items may become blocking points during implementation:

### FBP-01 – Better Auth `tanstackStartCookies` cookie behavior

**Risk**: The `tanstackStartCookies` plugin uses `getWebRequest()` and `appendResponseHeader()` from `@tanstack/react-start/server`. If the TanStack Start API changes these internals, the plugin may break.

**Status**: 🔍 INVESTIGATING at implementation time

**Mitigation**: Pin Better Auth version; test cookie behavior in integration tests before production.

---

### FBP-02 – Better Auth schema generation with Drizzle adapter

**Risk**: Better Auth's `generate` CLI command and the Drizzle adapter may have version-specific schema requirements.

**Status**: 🔍 Monitor at Phase 3 (DB Layer) implementation

**Mitigation**: Run `npx better-auth generate` after each Better Auth version update; commit generated schema.

---

### FBP-03 – PGLite WASM in Vite test environment

**Risk**: PGLite WASM initialization may behave differently in Vitest vs Vite dev vs production build.

**Status**: 🔍 Verify at Phase 3 (DB Layer) and Phase 10 (Testing)

**Mitigation**: Use `optimizeDeps.exclude: ['@electric-sql/pglite']` in vite.config.ts; test in isolation.

---

### FBP-04 – `routeTree.gen.ts` in CI

**Risk**: TanStack Router auto-generates `routeTree.gen.ts` during `pnpm dev` or `pnpm build`. CI must run `pnpm build` before type checking if this file is in `.gitignore`.

**Status**: 🔍 Decision needed: commit `routeTree.gen.ts` or generate in CI

**Options**:

- A: Commit `routeTree.gen.ts` (TanStack Router recommends this)
- B: Generate in CI before typecheck (adds build step complexity)

**Recommendation**: Option A – commit the generated file. TanStack Router docs recommend this.

---

### FBP-05 – Sentry `wrapStartHandler` with streaming

**Risk**: `Sentry.wrapStartHandler` wraps `defaultStreamHandler`. If Sentry's implementation doesn't correctly handle streaming SSR responses, errors may be lost or response may be corrupted.

**Status**: 🔍 Verify at Phase 9 (Observability)

**Mitigation**: Test with a deliberate error in a server function; confirm Sentry captures it.

---

## How to Resolve a Blocking Point

1. Investigate: try to resolve through documentation, testing, or community sources
2. If unresolvable: add to this document with status ⛔
3. Ask user for decision
4. After user decision: update status to ✅ and update relevant phase document
5. Update `plan.md` if blocking point affects delivery order
