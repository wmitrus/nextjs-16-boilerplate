# Technical Specification: Upstash Rate Limiting

## 1. Technical Context

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Runtime**: Node.js / Edge Runtime
- **Dependencies**:
  - `@upstash/ratelimit`
  - `@upstash/redis`
  - `zod` (for env validation)

## 2. Implementation Approach

We will implement two rate limiting strategies:

1. **Production (Redis)**: Uses Upstash Redis and the Sliding Window algorithm for distributed rate limiting.
2. **Local (In-Memory)**: A fallback for development and testing that stores request counts in memory.

The system will automatically switch between these based on the presence of Redis credentials.

## 3. Source Code Structure Changes

- `src/core/env.ts`: Add rate limit and Upstash configuration.
- `src/shared/lib/rate-limit.ts`: Production rate limiter using Upstash.
- `src/shared/lib/rate-limit-local.ts`: In-memory rate limiter for development.
- `src/shared/lib/get-ip.ts`: Utility to extract client IP from request headers.
- `src/shared/lib/rate-limit-helper.ts`: Unified helper to check rate limits.

## 4. Data Model / API / Interface Changes

### Environment Variables

```typescript
UPSTASH_REDIS_REST_URL: z.string().url().optional();
UPSTASH_REDIS_REST_TOKEN: z.string().optional();
API_RATE_LIMIT_REQUESTS: z.coerce.number().default(10);
API_RATE_LIMIT_WINDOW: z.string().default('60 s');
```

### Rate Limit Result Interface

```typescript
interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}
```

## 5. Delivery Phases

### Phase 1: Infrastructure & Dependencies

- Install `@upstash/ratelimit` and `@upstash/redis`.
- Update `src/core/env.ts` and `.env.example`.

### Phase 2: Core Logic

- Implement `get-ip.ts`.
- Implement `rate-limit-local.ts`.
- Implement `rate-limit.ts`.
- Implement `rate-limit-helper.ts`.

### Phase 3: Verification & Testing

- Add unit tests for `rate-limit-local.ts`.
- Add integration/e2e tests for rate limiting.

## 6. Verification Approach

- **Linting**: `pnpm lint`
- **Typechecking**: `pnpm typecheck`
- **Unit Testing**: `pnpm test`
- **Manual Verification**: Test rapid requests to a sample endpoint.
