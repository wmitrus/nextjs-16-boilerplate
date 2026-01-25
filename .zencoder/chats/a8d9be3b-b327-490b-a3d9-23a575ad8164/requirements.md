# Product Requirements Document: Upstash Rate Limiting

## 1. Purpose

The purpose of this feature is to protect the application's APIs from abuse, brute-force attacks, and excessive traffic by implementing a robust rate-limiting mechanism. It should support both a distributed Redis-backed limiter for production and an in-memory fallback for local development.

## 2. High-Level Behavior

- **Distributed Rate Limiting**: In production, use Upstash Redis to track requests across multiple instances/functions.
- **Local Fallback**: In development/test environments, use an in-memory bucket-based limiter to avoid external dependencies.
- **Identifier-Based**: Rate limiting should be applied based on unique identifiers (e.g., Client IP, User ID).
- **Graceful Feedback**: Provide clear feedback to users when they exceed the rate limit (HTTP 429 Too Many Requests).
- **Configurable**: Rate limits (requests per window) should be configurable via environment variables.

## 3. Implementation Details

- **Tech Stack**: Next.js 16, TypeScript, `@upstash/ratelimit`, `@upstash/redis`.
- **Environment Variables**:
  - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL.
  - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token.
  - `API_RATE_LIMIT_REQUESTS`: Number of requests allowed (default: 10).
  - `API_RATE_LIMIT_WINDOW`: Time window for requests (e.g., "60s").
- **Core Logic**:
  - `src/shared/utils/rate-limit.ts`: Production limiter logic.
  - `src/shared/utils/rate-limit-local.ts`: Local in-memory limiter logic.
- **Middleware/Utilities**:
  - A utility function to check rate limits in API routes or Server Actions.
  - IP extraction utility to reliably get the client's IP.

## 4. Usage

Developers can use the `checkRateLimit` utility in their API routes or Server Actions:

```typescript
const result = await checkRateLimit(identifier);
if (!result.success) {
  return new Response('Too Many Requests', { status: 429 });
}
```

## 5. Success Criteria

- API endpoints return 429 status code when the limit is exceeded.
- Rate limiting works correctly in both local (in-memory) and production (Redis) environments.
- Tests verify that rapid requests trigger the rate limit.
- No significant performance degradation for normal users.
