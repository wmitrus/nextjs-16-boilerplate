# 02 — Security & Auth Summary

**Task**: `2026-04-05-nr-browser-spa`
**Date**: 2026-04-05
**Status**: ✅ Approved with constraints

---

## Objective

Security review for the NR Browser SPA snippet injection via `NEW_RELIC_BROWSER_SNIPPET` env var. Focus: browser ingest key handling, env var exposure, CSP coverage, and logging safety.

---

## Security Surface

| Surface                             | Risk Class       | Assessment                                                         |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Browser ingest key (`NRJS-*`)       | Data exposure    | Write-only ingest key — safe to expose in HTML (by design)         |
| `NEW_RELIC_BROWSER_SNIPPET` env var | Server secret    | Must remain server-side; must not be logged; must not be committed |
| CSP `connect-src`                   | Browser policy   | Already includes `bam.nr-data.net` and `bam.eu01.nr-data.net` ✅   |
| `script-src` CSP                    | Script injection | `dangerouslySetInnerHTML` on controlled server string — acceptable |

---

## Key Findings

### Finding 1: Browser Ingest Key Classification ✅ SAFE

The browser snippet's `licenseKey` field is a **browser-only write-only ingest key**.

- It has no read capability
- It has no account management capability
- NR specifically designs this key to be publicly visible in HTML
- This is NOT a server license key (which would be `[A-Za-z0-9]{40}` format)
- **No action required** — this is a known pattern, not a vulnerability

### Finding 2: Env Var Server Isolation ✅ REQUIRED

`NEW_RELIC_BROWSER_SNIPPET` must be in the **server** schema in `src/core/env.ts`.

- T3-Env enforces that server vars are not accessible in client bundles at build time
- Do NOT use `NEXT_PUBLIC_` prefix — that would expose the full snippet to the client JS bundle
- The snippet content is rendered into server-generated HTML only
- **Constraint**: server schema only — Architecture Guard already called this out

### Finding 3: CSP Coverage ✅ ALREADY FIXED

Prior debug investigation already added NR beacon domains to `connect-src`:

```
https://bam.nr-data.net
https://bam.eu01.nr-data.net
```

The standalone browser app (538837440) uses the same EU beacon (`bam.eu01.nr-data.net`).
No additional CSP changes required for this task.

### Finding 4: Logging Safety — SEC-10 Compliance ✅ REQUIRED

The `getBrowserSnippetSafe()` function must NOT log the snippet content at any level.

- The snippet embeds a browser ingest key
- SEC-10: "Never log raw error objects" — extends to: never log credential-bearing content
- The function should be silent-on-success, catch-and-return-empty on failure
- No `console.log(snippet)`, no `logger.debug(snippet)`, no Sentry capture of snippet content

### Finding 5: `dangerouslySetInnerHTML` Safety ✅ ACCEPTABLE

The `<Script dangerouslySetInnerHTML={{ __html: snippetContent }}>` pattern is acceptable because:

- `snippetContent` comes from a server-side env var (not user input)
- Content is set by the operator, not derived from request data
- This is the standard NR-recommended injection pattern
- XSS risk: none — the content is operator-controlled, not user-controlled

### Finding 6: Repository Contamination Prevention ✅ REQUIRED

- `docs/newrelic-agent-snippet.js` is already gitignored ✅
- `.env.local` is already gitignored ✅
- `NEW_RELIC_BROWSER_SNIPPET=` in `.env.example` must have empty value (no actual snippet content)
- The comment in `.env.example` must explicitly state: "Do not commit actual snippet content"

---

## Mandatory Constraints for Implementation

1. **Server-side only**: `NEW_RELIC_BROWSER_SNIPPET` in `src/core/env.ts` server schema
2. **No logging**: `getBrowserSnippetSafe()` must not log snippet content at any level
3. **Empty in .env.example**: comment + empty value only — no actual key material
4. **`docs/newrelic-agent-snippet.js` remains gitignored**: already done, do not remove from `.gitignore`
5. **CSP**: no changes needed — already covers both NR beacon domains

---

## Verdict

**Approved.** No new security surface is introduced beyond what is already present. The browser ingest key is safe-to-expose by design. The critical constraint is keeping the env var server-side only and never logging its content.
