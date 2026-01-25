# Feature: Rate Limiting

## Purpose

The Rate Limiting feature protects the application's APIs from abuse, brute-force attacks, and excessive traffic. It provides a robust mechanism to throttle requests based on client identifiers like IP address or User ID.

## High-level Behavior

- **Distributed Strategy**: Uses **Upstash Redis** to synchronize request counts across multiple serverless functions or edge instances.
- **Local Strategy**: Falls back to an **in-memory** limiter for local development and testing, ensuring no external dependencies are required for standard dev workflows.
- **Auto-detection**: The system automatically switches to the distributed strategy if `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are provided.
- **Configurable Limits**: Throttling thresholds (requests per window) are fully configurable via environment variables.
- **Client Identification**: Reliably identifies clients by extracting IPs from standard proxy headers (`x-forwarded-for`, `cf-connecting-ip`, etc.).

## Implementation

### Core Components

- `src/proxy.ts`: Global proxy applying rate limiting to all `/api` routes (runs in Node.js runtime).
- `src/shared/lib/rate-limit.ts`: Production-ready distributed limiter using `@upstash/ratelimit`.
- `src/shared/lib/rate-limit-local.ts`: Lightweight in-memory limiter for local environments.
- `src/shared/lib/get-ip.ts`: Utility for robust client IP extraction.
- `src/shared/lib/rate-limit-helper.ts`: Unified helper function for consistent usage.

### Environment Variables

- `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL.
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token.
- `API_RATE_LIMIT_REQUESTS`: Maximum number of requests allowed (default: 10).
- `API_RATE_LIMIT_WINDOW`: Time window for requests (e.g., "60 s").

## Usage

### Global Proxy (Recommended)

By default, the boilerplate includes a proxy at `src/proxy.ts` that automatically applies rate limiting to all routes starting with `/api`. This is the recommended way to protect your endpoints.

### In API Routes or Server Actions

You can use the `checkRateLimit` helper to enforce limits in your server-side logic:

```typescript
import { checkRateLimit } from '@/shared/lib/rate-limit-helper';
import { getIP } from '@/shared/lib/get-ip';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const ip = await getIP(await headers());
  const result = await checkRateLimit(ip);

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

### Response Headers

When a limit is hit, it is recommended to return a `429 Too Many Requests` status along with a `Retry-After` header indicating the wait time in seconds.
