# Logging & Observability

## Overview

This project uses **Pino** with runtime-specific logger implementations:

- **Server (Node.js):** `src/core/logger/server.ts`
- **Edge:** `src/core/logger/edge.ts`
- **Browser:** `src/core/logger/browser.ts`
- **Client entry:** `src/core/logger/client.ts`
- **Server entry:** `src/core/logger/server.ts`
- **Edge entry:** `src/core/logger/edge.ts`

The logger is designed for:

- fast structured JSON logs
- environment-based log levels
- redaction of sensitive fields on server
- optional Logflare shipping per runtime
- shared client payload builder for browser/edge

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

## Usage

Use explicit entries to avoid bundling server-only modules in the client:

- Server/Route handlers and server components: `import { logger } from '@/core/logger/server'`
- Client components and browser-only utilities: `import { logger } from '@/core/logger/client'`

Each runtime logger is cached:

- Server: `getServerLogger()`
- Edge: `getEdgeLogger()`
- Browser: `getBrowserLogger()`

## Logflare routing

Logflare shipping is controlled by **environment flags** so each runtime can be enabled independently.

### Environment variables

Server-only:

- `LOGFLARE_API_KEY`
- `LOGFLARE_SOURCE_TOKEN`
- `LOGFLARE_SOURCE_NAME`
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

The ingest endpoint (`src/app/api/logs/route.ts`) validates payloads with Zod and ships to Logflare using server credentials.
It returns 400 for invalid payloads and warns once when credentials are missing while the runtime flag is enabled.

## Ingest endpoint

`POST /api/logs` accepts JSON payloads like:

- `level`: `fatal|error|warn|info|debug|trace`
- `msg`: string or structured message
- `message`: string (preferred when available)
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
- Ingest protection (rate limiting/auth) should be added before production deployment.
