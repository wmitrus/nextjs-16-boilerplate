# Case 16 (SEC-46) — Correlation / Request ID Trust Model

**Branch**: `claude/security-audit-multi-tenant-idor-e1y3yr` (PR #74)
**Date**: 2026-08-23
**Finding as reported**: "15. Request ID / correlation ID — nie ufać dowolnej wartości klienta"

## Cause

`classifyRequest()` took both identifiers verbatim from the caller:

```ts
req.headers.get('x-correlation-id') ?? crypto.randomUUID();
req.headers.get('x-request-id') ?? crypto.randomUUID();
```

No length ceiling, no charset, and no distinction between an id that names a
_chain_ and one that names a _request_. Unbounded caller-controlled text
reached the response headers, the structured logs, and
`audit_events.correlation_id` — a `text` column, so no bound there either.

The second defect was subtler and mattered more: `terminalHandler` forwarded
only the CSP request headers downstream, so RSC/Node code kept reading the
**raw inbound** values through `headers()`. The caller could be handed one id
on the response while the logs and the audit row recorded a different,
unvalidated one — the failure mode where an incident report cites an id that
appears nowhere.

## Decisions (user, 2026-08-23)

| Question            | Decision                                                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted format     | **Bounded safe charset, not UUID/ULID only** — `[A-Za-z0-9._:-]{1,128}`. A correlation id is interoperability metadata, not a credential; a UUID requirement establishes no trust boundary and breaks chains from ingresses using other formats |
| Invalid inbound id  | Silently replaced with `crypto.randomUUID()`, request proceeds. **Never a 400** — that turns an auxiliary header into a DoS lever                                                                                                               |
| Logging a rejection | Reason + length only, **never any fragment of the value**. Sampled, not one line per rejection — otherwise the header is a log-flooding primitive                                                                                               |
| `requestId`         | **Always** server-generated. A caller-supplied `x-request-id` is ignored outright, not validated                                                                                                                                                |
| Echo policy         | Validated external correlation id is echoed back (that is the point of the header); `x-request-id` is always ours                                                                                                                               |
| Scope               | One shared validator **plus** forwarding to RSC — Edge-only would leave the raw value in the Node path, which is where the audit column is written                                                                                              |

## Solution

- **`src/shared/lib/observability/correlation-id.ts`** (new) — `resolveCorrelationId()`,
  `generateRequestId()`, `CORRELATION_ID_MAX_LENGTH`, and the sampling counter
  `recordCorrelationRejection()`. `generateRequestId` takes no parameters at
  all, so there is no channel through which a caller value could reach it.
- **`route-classification.ts`** — uses the resolver; `x-request-id` is not read
  anywhere; `RouteContext` gains `correlationSource`, `correlationRejection`,
  `correlationRejectedLength`.
- **`with-security.ts`** — sampled WARN on a rejection, carrying
  `reason`/`receivedLength`/`rejectedTotal` and never the value.
- **`proxy.ts`** — `terminalHandler` now always builds forwarded request
  headers and overwrites `x-correlation-id`, `x-request-id` and
  `x-correlation-source`. Previously it only created them when a CSP nonce
  existed.
- **`server-request-log-context.ts`** — reads the forwarded `x-correlation-source`;
  a comment records that this layer deliberately does **not** re-validate,
  because five layers validating independently become five implementations
  that drift.

Not done here: persisting `correlationSource` in `audit_events` (needs a
migration for a field with no consumer yet) — **PE-23**, which also notes that
`correlation_id`/`request_id` are unconstrained `text`.

## Validation

- `correlation-id.test.ts` — accepted shapes (UUID, ULID, 32-char trace id,
  dotted/colon ids), replacement rather than truncation, refusal of
  log-splitting characters, length-not-content, the sampling curve.
- `proxy.test.ts` — six end-to-end tests: valid id echoed, hostile id replaced,
  oversized replaced, caller-chosen `x-request-id` never issued, forwarded
  headers equal to the ones the caller was handed, `external` marking.
- `correlation-id.guard.test.ts` — static: request id derived from nothing the
  caller sent, raw inbound header read in the boundary only, forwarding not
  behind the nonce branch, pattern stays bounded.

**Falsified**: restoring the raw-header behaviour fails 5 of the 6 behavioural
tests; moving the forwarding inside the `if (ctx.nonce)` branch fails the
guard.

**Learned while writing the tests**: a CRLF value never reaches this code — the
`Headers` implementation refuses to hold it. The first draft asserted on a
CRLF payload and failed for that reason, not for the reason intended. The test
now uses CRLF-free values that are still unfit to echo, log and persist, and
records why.

Also: `/api/**` short-circuits at the auth guard with a 401 and never reaches
`terminalHandler`, so the forwarding tests use a public page route. A
forwarding test on an API path would have passed vacuously.

## Documentation

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — SEC-46.
- `docs/features/20 - Enterprise Security Architecture.md` — new §3.3 (CSP
  renumbered to §3.4).
- `docs/features/12 - Logging & Observability.md` — what the model buys the logs.
- `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-23.
