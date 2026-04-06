# 01 — Architecture Guard Summary

**Task**: `2026-04-05-nr-browser-spa`
**Date**: 2026-04-05
**Status**: ✅ Approved with constraints

---

## Objective

Review the architectural fit of replacing `getBrowserTimingHeader()` (APM "rum" loader) with a standalone NR Browser SPA snippet injected via env var, for proper Next.js App Router client-side navigation tracking.

---

## Affected Layers

| Layer                | File                                  | Change                                                          |
| -------------------- | ------------------------------------- | --------------------------------------------------------------- |
| Core / Observability | `src/core/observability/new-relic.ts` | Add `getBrowserSnippetSafe()` function                          |
| Core / Env           | `src/core/env.ts`                     | Add `NEW_RELIC_BROWSER_SNIPPET` optional server-side var        |
| App / Layout         | `src/app/layout.tsx`                  | Swap `getBrowserTimingHeaderSafe()` → `getBrowserSnippetSafe()` |
| Config               | `newrelic.js`                         | Revert logging level `trace` → `info`                           |
| Documentation        | `.env.example`                        | Add commented entry for `NEW_RELIC_BROWSER_SNIPPET`             |

---

## Boundary Analysis

### Dependency Direction ✅

- `src/app/layout.tsx` → `@/core/observability/new-relic` (core layer) — correct direction
- `src/core/observability/new-relic.ts` → `@/core/env` — correct intra-core dependency
- No new cross-module boundary crossings introduced

### Module Ownership ✅

- All NR observability logic remains in `src/core/observability/new-relic.ts`
- `layout.tsx` continues to call only facade functions — does not import `newrelic` directly
- Env schema (`src/core/env.ts`) remains the single source of truth for feature config

### Single Responsibility ✅

- `getBrowserSnippetSafe()` owns one concern: return the safest available browser script string
- Priority chain: `NEW_RELIC_BROWSER_SNIPPET` (if set) → `getBrowserTimingHeaderSafe()` (APM fallback) → `''`
- `layout.tsx` does not need to know which path was taken

### Client Bundle Safety ✅

- `NEW_RELIC_BROWSER_SNIPPET` must NOT use `NEXT_PUBLIC_` prefix — stays server-side
- Snippet content is only rendered into server-generated HTML, never bundled into client JS
- `src/core/env.ts` server schema is already enforced by T3-Env to be server-side only

---

## Architecture Constraints

### REQUIRED

1. `NEW_RELIC_BROWSER_SNIPPET` — server schema only (NOT client schema). Any `NEXT_PUBLIC_` prefix would expose the snippet to the client bundle — this must not happen.
2. `getBrowserSnippetSafe()` must be in `src/core/observability/new-relic.ts` — not inline in `layout.tsx`.
3. The fallback chain (`snippet → APM header → empty`) must be transparent to `layout.tsx`.
4. The existing `getBrowserTimingHeaderSafe()` must NOT be deleted — it remains as the fallback and may have independent value for APM-correlated transactions.

### RECOMMENDED

5. Use `z.string().optional()` for the env var without a `max()` constraint — NR snippets are legitimately 20-50KB.
6. Do not validate snippet content (no regex, no startsWith checks) — content is provider-controlled and opaque to this layer.
7. Add a clear comment in `.env.example` that this var accepts raw JS content (not a URL, not a file path).

### FORBIDDEN

8. Do not log the snippet content at any level — it contains a browser ingest key.
9. Do not expose snippet content via any server action, route handler, or client-accessible API.
10. Do not commit any actual snippet content to the repository.

---

## Rollback Design ✅

The rollback mechanism is correct:

- `NEW_RELIC_BROWSER_SNIPPET` is optional in the schema
- If unset → `getBrowserSnippetSafe()` falls back to `getBrowserTimingHeaderSafe()` → prior behavior
- Rollback = remove env var from `.env.local` or deployment config
- No code change required to roll back

---

## Risk Assessment

| Risk                                     | Level  | Mitigation                                                |
| ---------------------------------------- | ------ | --------------------------------------------------------- |
| Browser ingest key committed to repo     | Medium | Gitignore enforced; env var stays in `.env.local`         |
| Snippet content logged                   | Low    | SEC-10 compliance — do not log; facade sanitizes          |
| Env var size limit in deployment         | Low    | Vercel limit is 64KB; NR snippet is ~30-50KB — acceptable |
| Breaking existing APM browser monitoring | None   | Fallback chain preserves prior behavior                   |
| Client bundle exposure                   | None   | Server-only env var; T3-Env enforces separation           |

---

## Verdict

**Approved.** The design is architecturally sound, low blast radius, and correctly placed within existing layer boundaries. All constraints above must be observed by the Implementation agent.
