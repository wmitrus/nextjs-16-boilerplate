# Feature: Rate Limiting

## Purpose

The Rate Limiting feature protects the application's APIs from abuse, brute-force attacks, and excessive traffic. It throttles requests based on client identifiers (IP address) and enforces a configurable window-based quota.

## High-Level Behaviour

- **Distributed strategy**: Uses **Upstash Redis** to synchronize request counts across serverless function instances.
- **Local strategy**: Falls back to an **in-memory** limiter for local development and testing — no external dependencies required.
- **Auto-detection**: The system automatically selects the Upstash strategy when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set.
- **Configurable limits**: Throttling thresholds are controlled by environment variables.
- **Client identification**: IP extracted from standard proxy headers (`x-forwarded-for`, `cf-connecting-ip`, etc.) via `get-ip.ts`.

## Implementation

### Core Components

| File                                             | Role                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `src/proxy.ts`                                   | Global proxy — applies `withRateLimit` to all `/api` routes |
| `src/security/middleware/with-rate-limit.ts`     | Rate-limit middleware wrapper used by the proxy             |
| `src/shared/lib/rate-limit/rate-limit.ts`        | Upstash distributed limiter                                 |
| `src/shared/lib/rate-limit/rate-limit-local.ts`  | In-memory limiter for local/test environments               |
| `src/shared/lib/rate-limit/rate-limit-helper.ts` | Unified `checkRateLimit()` helper                           |
| `src/shared/lib/network/get-ip.ts`               | Robust client IP extraction                                 |

### Environment Variables

| Variable                   | Description                                   | Default  |
| -------------------------- | --------------------------------------------- | -------- |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis REST URL                        | —        |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token                      | —        |
| `API_RATE_LIMIT_REQUESTS`  | Maximum requests per window                   | `10`     |
| `API_RATE_LIMIT_WINDOW`    | Time window (e.g. `"60 s"`, `"1 m"`, `"1 h"`) | `"60 s"` |

## Usage

### Global Proxy (Standard Path)

`src/proxy.ts` automatically applies rate limiting to all `/api` routes. No per-route code is needed for standard endpoints.

### In API Routes or Server Actions

To enforce limits inline in a specific route handler:

```typescript
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const ip = await getIP(await headers());
  const result = await checkRateLimit(ip, { path: req.url });

  if (!result.success) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': Math.ceil(
          (result.reset.getTime() - Date.now()) / 1000,
        ).toString(),
      },
    });
  }

  // Proceed with the request...
}
```

Always pass `{ path: req.url }` (or the route pathname) as the second argument to `checkRateLimit`. This is required for loop prevention — see below.

---

## Loop Prevention Architecture

### The Problem

The proxy's `withRateLimit` middleware calls `checkRateLimit()` for every `/api` request. When the Upstash provider is unreachable, `checkRateLimit()` waits 1500 ms (timeout), then:

1. Logs a WARN via the edge logger
2. Falls back to the local in-memory limiter

The edge logger (`src/core/logger/edge-utils.ts`) forwards log events to `/api/logs` for centralised ingestion. The loop prevention guard in `edge-utils.ts` checks whether `payload.context.path === '/api/logs'` before forwarding, and suppresses the event if true.

**The failure mode**: If `checkRateLimit()`'s WARN does not include `path` in its log context, the guard evaluates `undefined === '/api/logs'` → **false** → the WARN is forwarded to `/api/logs` → which triggers another rate-limit check → another WARN → infinite recursive flood of log events to `/api/logs`.

This cascade can exhaust BetterStack, New Relic, and Upstash request quotas in minutes during any Upstash outage.

### The Fix

`checkRateLimit()` accepts an optional second parameter:

```typescript
export async function checkRateLimit(
  identifier: string,
  meta?: { path?: string },
): Promise<RateLimitResult>;
```

When Upstash times out, `path` is included in the WARN context:

```typescript
getLogger().warn(
  {
    provider: 'upstash',
    identifier,
    timeoutMs: UPSTASH_RATE_LIMIT_TIMEOUT_MS,
    errorMessage: error.message,
    errorName: error.name,
    path: meta?.path, // ← loop prevention key
  },
  'Rate limit provider unavailable, using local fallback',
);
```

`withRateLimit` passes the request pathname unconditionally:

```typescript
const result = await checkRateLimit(ip, { path: pathname });
```

**Result**: When Upstash is unreachable during an `/api/logs` request, the WARN carries `path: '/api/logs'` → `edge-utils.ts` guard evaluates `'/api/logs' === '/api/logs'` → **true** → event suppressed → no cascade.

### Why `/api/logs` Must Remain Rate-Limited

An earlier (incorrect) fix bypassed rate limiting for `/api/logs` entirely via a `SELF_RATE_LIMITED_PATHS` constant. This was wrong for two reasons:

1. **Unprotected endpoint**: Without rate limiting, any client can flood `/api/logs` at full speed, exhausting BetterStack/NR log quotas
2. **Wrong abstraction**: The problem was missing context in the WARN log, not rate limiting being applied

The `SELF_RATE_LIMITED_PATHS` constant has been **removed**. `/api/logs` is rate-limited by the same rules as all other `/api` routes. **Do not re-add a bypass.**

### Upstash Outage Scenario

During a sustained Upstash outage:

- Every `/api` request incurs a 1500 ms timeout penalty before falling back to local rate limiting
- The fallback still enforces the configured `API_RATE_LIMIT_REQUESTS` / `API_RATE_LIMIT_WINDOW` limits
- WARN events are generated but **not** cascaded — loop prevention suppresses them for `/api/logs` requests
- No runaway log flood occurs

---

## Response Headers

All rate-limited responses include standard headers:

| Header                  | Value                                      |
| ----------------------- | ------------------------------------------ |
| `X-RateLimit-Limit`     | Configured maximum requests per window     |
| `X-RateLimit-Remaining` | Requests remaining in the current window   |
| `X-RateLimit-Reset`     | Unix timestamp (ms) when the window resets |
| `Retry-After`           | Seconds until retry (429 responses only)   |

---

## Guardrails

- **Do NOT** add a bypass list** (`SELF_RATE_LIMITED_PATHS` or equivalent) for internal API routes** — the correct fix for loop prevention is propagating `path` in the log context, not removing rate limiting.
- **Always pass `meta.path`** when calling `checkRateLimit()` from a request handler — omitting it re-opens the loop prevention gap.
- **Do NOT** reduce `UPSTASH_RATE_LIMIT_TIMEOUT_MS` below a value that allows realistic Upstash cold-start latency — too short a timeout causes unnecessary fallbacks in production.
- **Do NOT** use the local in-memory rate limiter as the only protection on a production deployment — it is not shared across function instances and resets on every cold start.
