# Implementation Report — NR Browser: Route Change Tracking

## Status

**CORRECTION NOTICE**: An earlier version of this report incorrectly recommended setting `NEW_RELIC_BROWSER_SNIPPET_BASE64` as a Vercel environment variable. This was already ruled out in the completed task `.copilot/tasks/2026-04-05-nr-browser-spa/` — the snippet is 88 KB and exceeds Vercel's documented per-variable limit. Do not follow that guidance. The current delivery model (request-time Node route via `getBrowserTimingHeaderSafe()`) is the correct and already-implemented approach.

---

## Root Cause of "Only 1 Request in NR Browser"

**Confirmed by** `.copilot/tasks/2026-04-05-nr-browser-spa/06 - Debug Investigation - Summary.md`:

- The APM-linked loader served by `getBrowserTimingHeaderSafe()` is the **rum/lite type** (`"agent":""`)
- The rum loader only tracks the initial hard page load (Apdex, page timing)
- It does NOT create new page views or interactions for client-side (App Router `pushState`) navigations
- Result: exactly 1 page view per hard navigation — confirmed expected behavior of rum loader

**Fix required (NR UI action, no code change)**:

- Switch the NR APM application's browser monitoring type to **SPA** in the NR UI
- Path: Browser → Your App → Application settings → Browser agent type → SPA
- After this change, `getBrowserTimingHeaderSafe()` will return an SPA loader that automatically intercepts `pushState`/`popState` and creates route-change interactions

---

## Code Changes Applied in This Session

### 1. `src/types/globals.d.ts` — Added `window.newrelic` type declarations

Added inside `declare global { ... }`:

- `NewRelicBrowserInteraction` interface
- `NewRelicBrowserAgent` interface
- `Window.newrelic?: NewRelicBrowserAgent` augmentation

These are needed for type-safe access to the NR Browser API from TypeScript.

### 2. `src/instrumentation-client.ts` — Added NR to `onRouterTransitionStart`

Changed from a direct Sentry reference to a wrapper that calls both Sentry and NR:

```typescript
export const onRouterTransitionStart: typeof Sentry.captureRouterTransitionStart =
  (url, ...rest): void => {
    Sentry.captureRouterTransitionStart(url, ...rest);
    if (typeof window !== 'undefined') {
      window.newrelic?.interaction()?.setName(url)?.save();
    }
  };
```

This fires on every App Router client-side navigation and explicitly names the NR interaction with the target URL. Works correctly with the SPA loader type once switched in NR UI. Safe no-op when the NR browser agent is not loaded.

---

## What Was Investigated and Excluded

| Approach                                                           | Status                            | Reason                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Set `NEW_RELIC_BROWSER_SNIPPET_BASE64` on Vercel                   | ❌ Excluded                       | Snippet is 88 KB — exceeds Vercel per-variable limit. Already documented in `.copilot/tasks/2026-04-05-nr-browser-spa/` |
| Read snippet from `docs/newrelic-agent-snippet.js` at request time | ℹ️ Gitignored local fallback only | File is gitignored, does not deploy to Vercel                                                                           |
| `readRawSnippetFromEnvFiles()`                                     | ℹ️ Local dev fallback only        | Reads `.env.local` / `.env` — not present on Vercel                                                                     |
| Switch APM browser type to SPA in NR UI                            | ✅ Correct fix                    | Makes `getBrowserTimingHeaderSafe()` return SPA loader automatically                                                    |

---

## Prior Task Reference

The full implementation history, constraints, and deployment guidance is documented in:
**`.copilot/tasks/2026-04-05-nr-browser-spa/`**

That task is complete and authoritative. Any NR Browser changes must check it first.
