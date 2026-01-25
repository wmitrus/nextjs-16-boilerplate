# Logging & Observability

## Overview

This project uses **Pino** with runtime-specific logger implementations:

- **Server (Node.js):** `src/core/logger/server.ts`
- **Edge:** `src/core/logger/edge.ts`
- **Browser:** `src/core/logger/browser.ts`
- **Unified entry:** `src/core/logger/index.ts`

The logger is designed for:

- fast structured JSON logs
- environment-based log levels
- redaction of sensitive fields on server
- optional Logflare shipping per runtime

## Runtime behavior

### Server (Node.js)

Server logging uses `pino` + streams from `src/core/logger/streams.ts`:

- Console (pretty) in dev/test
- File (optional) in dev/prod
- Logflare stream (optional)

Sensitive fields are redacted on the server logger.

### Edge

Edge uses `pino` in browser mode with a custom transmit that forwards logs to the ingest endpoint.

### Browser

Browser uses `pino` in browser mode with a custom transmit that forwards logs to the ingest endpoint.

## Logflare routing

Logflare shipping is controlled by **environment flags** so each runtime can be enabled independently.

### Environment variables

Server-only:

- `LOGFLARE_API_KEY`
- `LOGFLARE_SOURCE_TOKEN`
- `LOGFLARE_SERVER_ENABLED`
- `LOGFLARE_EDGE_ENABLED`

Client:

- `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED`
- `NEXT_PUBLIC_APP_URL` (required for edge forwarding)
- `NEXT_PUBLIC_LOG_LEVEL`

### Routing matrix

- **Server logs → Logflare** when `LOGFLARE_SERVER_ENABLED=true`.
- **Edge logs → /api/logs → Logflare** when `LOGFLARE_EDGE_ENABLED=true`.
- **Browser logs → /api/logs → Logflare** when `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED=true`.

The ingest endpoint (`src/app/api/logs/route.ts`) validates payloads and ships to Logflare using server credentials.

## Ingest endpoint

`POST /api/logs` accepts JSON payloads like:

- `level`: `fatal|error|warn|info|debug|trace`
- `msg`: string or structured message
- `context`: object
- `source`: `browser|edge`

If Logflare is disabled for the specific source, the endpoint returns 204 without forwarding.

## Recommended with Sentry

When Sentry is integrated for error management, keep Logflare focused on:

- request/response **metadata** and **performance** (duration, status, route)
- **business events** and audit trails
- **warnings** and non-exception anomalies
- **structured context** for correlation (request id, env, revision)

## Notes

- HTTP request logging is not automatic yet; add a wrapper or middleware if needed.
- Client logging uses `sendBeacon` with a `fetch` fallback to avoid blocking navigation.
