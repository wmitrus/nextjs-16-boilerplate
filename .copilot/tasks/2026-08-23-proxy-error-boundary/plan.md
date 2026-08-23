# Case 15 (SEC-45) — Proxy Error Path Must Preserve Response Hardening

**Branch**: `claude/security-audit-multi-tenant-idor-e1y3yr` (PR #74)
**Date**: 2026-08-23
**Finding as reported**: "14. Proxy error path powinien zachowywać security headers"

## Cause

`runSecurityPipeline` in `src/proxy.ts` caught everything the Edge pipeline
threw and answered with a hand-built response:

```ts
catch (error) {
  console.error('[Proxy Error]', error);
  return NextResponse.json({ status: 'server_error', ... }, { status: 500 });
}
```

That reply is assembled **outside** `withSecurity()`, which is the function
that runs `withHeaders()` and stamps the correlation metadata. So a throw
anywhere in the chain produced the one response in the application with no CSP,
no `nosniff`, no `X-Frame-Options`, no `Referrer-Policy`, no CORP/COOP and no
correlation id — logged through `console.error`, outside the structured edge
logger and whatever redaction it applies.

The root defect is structural rather than any single missing header: the
hardening chain existed in **two** places. Adding a header to `withSecurity`
would have hardened every response except the failure one, silently.

## Decisions (user, 2026-08-23)

| Question                                                     | Decision                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Where does the fallback 500 originate?                       | Inside `withSecurity`, wrapping the composed handler; the proxy keeps only a last-resort net                        |
| May dev/preview show the error text?                         | No — generic in every environment, no `NODE_ENV` branch                                                             |
| Where does `correlationId` go?                               | Headers only. `ServerErrorResponse` unchanged. Reuse `ctx.correlationId`; never mint a second id in the outer catch |
| The four hand-built `NextResponse.json()` in `with-auth.ts`? | PE-22, not this case — they are returned from inside the pipeline and do reach finalization                         |

## Solution

- **`src/security/middleware/with-security.ts`** — `await handler(request, ctx)`
  is wrapped in try/catch. The catch writes a structured edge log carrying
  `ctx.correlationId`, `ctx.requestId`, path and the error message, then sets
  `response` to `createServerErrorResponse('Internal Server Error', 500,
'SERVER_ERROR')`. Execution falls through to the **existing** `withHeaders()`
  - correlation lines — one finalization path for thrown and returned responses
    alike.
- **`src/proxy.ts`** — `console.error` replaced by the structured edge logger;
  the outer catch now returns `createServerErrorResponse(...)` through
  `withHeaders(request, response)`. It deliberately mints **no** correlation id:
  it only fires for throws with no `ctx` (`classifyRequest()`, container
  wiring), and a fresh id would join to nothing in the logs.

Why the boundary sits inside `withSecurity` and not further out: that is the
last frame still holding the `RouteContext`. A catch outside it must either
omit the correlation id or invent a second one, and must re-implement the
finalization — which is the drift this case is about.

## Validation

`src/proxy.test.ts` gained a `thrown pipeline path (SEC-45)` block. The suite
previously covered 429, 403 and the happy path — every response the pipeline
_returned_, none that it threw.

1. A middleware rejects with `connect ECONNREFUSED postgres://app:hunter2@10.0.0.4:5432/prod`.
   Asserts 500, generic body, `SERVER_ERROR`, plus `nosniff`, `X-Frame-Options`,
   `Referrer-Policy`, CORP, CSP, `x-correlation-id`, `x-request-id`.
2. Asserts no fragment of the connection string (`hunter2`, `10.0.0.4`,
   `postgres`) reaches the body.

**Falsified**: with the boundary removed and the old bare-JSON catch restored,
test 1 fails on `expected null to be 'nosniff'`. Test 2 still passes — honest
and expected, since the old code was also generic in the body; that assertion
guards against a future "helpful" change adding `error.message`.

## Documentation

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-45.
- `docs/features/20 - Enterprise Security Architecture.md` — new §3.2 (existing
  CSP section renumbered to §3.3).
- `docs/features/14 - Error Handling & Response Service.md` — the Edge boundary
  now consumes this service; the deliberate asymmetry with
  `with-error-handler.ts`.
- `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-22, including the user's note
  that its guard must forbid hand-assembling the error envelope rather than
  banning `NextResponse.json()` across security middleware.
