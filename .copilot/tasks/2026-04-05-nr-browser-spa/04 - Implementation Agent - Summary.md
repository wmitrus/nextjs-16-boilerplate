# 04 — Implementation Agent Summary

**Task**: `2026-04-05-nr-browser-spa`
**Date**: 2026-04-05
**Status**: ✅ Complete

---

## Changes Made

### 1. `src/core/env.ts`

- Added `NEW_RELIC_BROWSER_SNIPPET: z.string().optional()` to server schema
- Added `NEW_RELIC_BROWSER_SNIPPET: process.env.NEW_RELIC_BROWSER_SNIPPET` to runtime binding
- Server-side only — no `NEXT_PUBLIC_` prefix

### 2. `src/core/observability/new-relic.ts`

- Added `getBrowserSnippetSafe()` export
- Priority: `process.env.NEW_RELIC_BROWSER_SNIPPET` (standalone SPA snippet) → `getBrowserTimingHeaderSafe()` (APM fallback) → `''`
- No top-level imports added (module stays import-free at module level — avoids T3-Env init in test context)
- `process.env.NEW_RELIC_BROWSER_SNIPPET` accessed at call time, not module load time

### 3. `src/app/layout.tsx`

- Import changed: `getBrowserTimingHeaderSafe` → `getBrowserSnippetSafe`
- Call site updated: `getBrowserTimingHeaderSafe()` → `getBrowserSnippetSafe()`
- No other changes to layout

### 4. `.env.example`

- Added `NEW_RELIC_BROWSER_SNIPPET=` (empty value) with 4-line security comment
- Comment instructs: get snippet from NR UI, use Pro+SPA, never commit actual content

### 5. `newrelic.js`

- Reverted `logging.level` from `'trace'` (debug session) back to `'info'`

---

## Design Decisions

| Decision                                   | Rationale                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `process.env` over `env` object            | `new-relic.ts` has no top-level imports; adding T3-Env import at module level breaks test isolation (bootstrap.test.ts) |
| Fallback to `getBrowserTimingHeaderSafe()` | Preserves APM approach for users who don't set `NEW_RELIC_BROWSER_SNIPPET`                                              |
| Server-side env var                        | Snippet contains browser ingest key — must not appear in client bundle                                                  |
| No validation on snippet content           | Content is provider-controlled and opaque; length validation would reject valid large snippets                          |

---

## Rollback Procedure

Rollback requires zero code changes:

1. Remove `NEW_RELIC_BROWSER_SNIPPET` from `.env.local` (or deployment env store)
2. `getBrowserSnippetSafe()` falls back to `getBrowserTimingHeaderSafe()` automatically
