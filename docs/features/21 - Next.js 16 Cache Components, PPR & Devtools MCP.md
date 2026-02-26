# Next.js 16 Cache Components, PPR & Devtools MCP

## Purpose

This document explains how this boilerplate uses **Next.js 16 Cache Components** and **Partial Pre-Rendering (PPR)**, and how to adopt a practical **Devtools MCP** debugging workflow.

It is written for day-to-day implementation and production troubleshooting in this repository.

---

## Current Project Status

### Enabled in this repository

- `cacheComponents: true` is already enabled in `next.config.ts`.
- App Router route loading states are supported (for example: `src/app/security-showcase/loading.tsx`).
- `@vercel/speed-insights` is now rendered only on Vercel environments (`preview`/`production`) to avoid local script 404 noise.

### Important behavior you should expect

- Routes can still be dynamic if they use dynamic server APIs (`headers()`, auth/session lookups, etc.).
- Cache Components does not make all dynamic work disappear; it enables better composition and streaming boundaries.
- A page can show a loading skeleton immediately while dynamic sections resolve in parallel.

---

## Cache Components + PPR in Practice

## 1) Mental model

With Cache Components enabled:

- Treat each route as a mix of:
  - **fast shell** (stable, cache-friendly UI), and
  - **dynamic islands** (auth, request-specific data, real-time or user-bound data).
- Use loading boundaries so navigation feels immediate.

## 2) What makes a route dynamic

Common dynamic triggers in this codebase:

- `headers()`
- Auth/session resolution (Clerk)
- Request-scoped context generation
- User-specific repository lookups

If a page needs these, that is valid. The goal is to keep dynamic work narrow and bounded.

## 3) Recommended structure

- Keep the route shell lightweight.
- Move expensive request-bound work behind explicit boundaries.
- Add route-level `loading.tsx` for instant user feedback on first navigation.
- Use short, explicit fallbacks for non-critical diagnostics sections.

## 4) Example from this repository

`/security-showcase`:

- Uses request-bound security context (dynamic by nature).
- Uses a route-level loading UI to avoid “click happened but nothing changed” perception.
- Applies timeout/degraded-mode handling for context resolution to prevent long blocking.

---

## Guardrails for Contributors

### Do

- Keep dynamic server calls close to where they are needed.
- Preserve modular-monolith boundaries (contracts/DI/modules) when optimizing.
- Prefer reducing critical-path work over adding global hacks.
- Validate in both `pnpm dev` and `pnpm build && pnpm start`.

### Don’t

- Don’t bypass Next.js primitives with ad-hoc navigation workarounds.
- Don’t move auth/session logic into unrelated UI layers.
- Don’t “optimize” by removing security checks required by the architecture.

---

## Production-Like Validation Checklist

For any page that “feels slow”:

1. Build and run production mode:

```bash
pnpm build
pnpm start
```

2. Compare baseline timings:

```bash
curl -sS -o /dev/null -w 'code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n' http://localhost:3000/
curl -sS -o /dev/null -w 'code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n' http://localhost:3000/security-showcase
```

3. If route total is high while TTFB is low:

- suspect post-response or hydration/interactive work.

4. If both TTFB and total are high:

- suspect server-path blocking (middleware/auth/repositories/external calls).

---

## Devtools MCP Workflow (Operational Guide)

## What it is

Devtools MCP is a workflow where your AI assistant can reason over runtime/browser/server debugging context with better framework awareness.

## What it is **not**

- It is **not** enabled by `next.config.ts`.
- It is **not** a substitute for architecture boundaries or tests.

## Suggested usage pattern in this repo

1. Reproduce issue in `dev` and `start`.
2. Capture:
   - active route,
   - browser console errors,
   - server logs,
   - middleware behavior,
   - timings (`ttfb`, `total`).
3. Ask AI to analyze with route + runtime context, not isolated stack traces.
4. Apply the smallest architectural-safe fix.
5. Re-run targeted tests and prod-mode timing checks.

## Minimum context to provide AI

- Route URL and whether issue is `dev` only, `start` only, or both.
- Whether first click works or requires retries.
- Console + server logs around the exact timestamp.
- Current middleware/auth state assumptions.

---

## Team Conventions for Future Changes

- Any performance fix must keep modular-monolith layering intact.
- For route-interaction complaints, always distinguish:
  - navigation responsiveness,
  - server latency,
  - hydration/interactive readiness.
- Prefer explicit loading UIs over hidden waiting.

---

## Team Quick Start (Copy/Paste Playbook)

Use this exact sequence when reporting or fixing route performance/navigation issues.

### 1) Reproduce in both runtimes

```bash
pnpm dev
# reproduce once in browser

pnpm build
pnpm start
# reproduce once in browser
```

### 2) Capture objective timing

```bash
curl -sS -o /dev/null -w 'code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n' http://localhost:3000/
curl -sS -o /dev/null -w 'code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n' http://localhost:3000/security-showcase
```

### 3) Capture debug context for AI/MCP analysis

- Active route + runtime (`dev`/`start`).
- Browser console output around click time.
- Server logs around click time.
- Whether first click navigates or requires repeated clicks.

### 4) Apply fix with architecture guardrails

- Keep Next.js-native primitives (`Link`, `loading.tsx`, route boundaries).
- Keep modular-monolith boundaries (contracts + DI + module isolation).
- Avoid moving security logic into UI components.

### 5) Validate before PR

```bash
pnpm typecheck
pnpm test
pnpm build
```

### 6) PR description template snippet

```md
### Route Perf Debug Playbook

- Runtime reproduced in: dev / start / both
- Route measured: /security-showcase
- Baseline timing (ttfb/total):
- Post-fix timing (ttfb/total):
- Root cause category: navigation responsiveness / server latency / hydration
- Architecture boundaries preserved: yes/no (explain)
```

---

## Related Files

- `next.config.ts`
- `src/app/layout.tsx`
- `src/app/security-showcase/page.tsx`
- `src/app/security-showcase/loading.tsx`
- `src/security/middleware/with-auth.ts`
- `src/security/middleware/with-headers.ts`

---

## Quick Summary

- Cache Components is already enabled and should stay enabled.
- PPR value comes from clear static-vs-dynamic boundaries plus loading feedback.
- Devtools MCP is a debugging workflow integration, not a single config switch.
- In this repository, treat route responsiveness and architecture safety as equal requirements.
