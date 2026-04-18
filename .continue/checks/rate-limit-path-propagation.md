---
name: Rate-Limit Path Propagation
description: Review request-aware checkRateLimit calls for missing meta.path propagation
---

If the PR does not add or modify any `checkRateLimit(` call site, request-aware rate-limit wrapper, or code that derives a request pathname before rate limiting, no action is needed.

Focus on changed lines in areas such as:

- `src/security/middleware/**`
- API route handlers and request-aware wrappers under `src/app/**`
- request-aware helpers that call `checkRateLimit(...)`
- logging or observability code around rate-limit fallback behavior

Do not review helper internals, mocks, or tests unless the changed production code introduces a new request-aware `checkRateLimit(...)` call pattern.

This repository has a specific rule for edge-log loop prevention: when `checkRateLimit()` is called from a request-aware context, it must receive `meta.path` so timeout WARN logs can preserve the current path.

Review the changed files against these sources before deciding pass or fail:

- `AGENTS.md` (the `Rate Limiting - Edge-Log Loop Prevention` section)
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` (especially `SEC-17`)
- `.continue/rules/security-coding-patterns.md`
- `src/security/middleware/with-rate-limit.ts`
- `src/shared/lib/rate-limit/rate-limit-helper.ts`

Look for these issues and fail only if they are introduced by the changed lines:

## 1. Missing meta.path In Request-Aware Context

- a changed line adds or modifies `checkRateLimit(identifier)` in code that already has access to `req.nextUrl.pathname`, `request.nextUrl.pathname`, `pathname`, `request.url`, or another request-derived path source, but does not pass `{ path: ... }`
- a changed line moves a `checkRateLimit(...)` call into middleware, route handlers, or request-aware wrappers and drops previously available path propagation

## 2. Broken Or Indirect Path Propagation

- the change passes an empty object or unrelated metadata instead of `{ path: pathname }` or equivalent request-derived path
- the change assumes helper internals will infer the path automatically
- the change forwards rate-limit warnings or fallback behavior from a request-aware context without preserving the path in the `checkRateLimit(...)` call

## 3. Misleading Safe-Looking Exceptions

- the change introduces a request-aware call site in middleware or a route handler and omits `meta.path` because the current endpoint is considered internal or low risk
- the change adds a bypass list or workaround instead of propagating `path` into the rate-limit helper

Accept as safe when the changed code clearly does one of these:

- calls `checkRateLimit(ip, { path: pathname })` or an equivalent request-derived path value
- passes a path value that is clearly derived from the active request context before the rate-limit call
- changes only helper internals, mocks, or tests without introducing a new production request-aware call site
- calls `checkRateLimit(...)` in a non-request-aware context where no path exists and the diff does not suppress an available request path

When reviewing, identify whether the changed `checkRateLimit(...)` call site is request-aware. If it is, verify that the same local flow provides `meta.path`.

Passing result expectations:

- every new or modified request-aware `checkRateLimit(...)` call propagates `meta.path`
- changed rate-limit wrappers preserve the local `SEC-17` safeguard against recursive edge-log forwarding
- the review distinguishes production request call sites from helper tests and mocks

Do not fail only because a file mentions rate limiting. Fail when the changed code introduces or preserves a request-aware `checkRateLimit(...)` call without `meta.path` propagation.
