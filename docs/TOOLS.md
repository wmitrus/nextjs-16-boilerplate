# External Tools & Integrations

This document lists integrations that require external registration, tokens, or configuration.

## Related operational policy

For safe package update workflow and rollback strategy, see:

- [Dependency Upgrade Safety Policy](./usage/02%20-%20Dependency%20Upgrade%20Safety%20Policy.md)

## Logflare

**Website:** https://logflare.app

**Purpose:** External log shipping for server/edge/browser logs.

**Setup:**

1. Create a Logflare account and a Log Source.
2. Copy the **API key** and **Source token** (or **Source name**).
3. Set these environment variables:

- `LOGFLARE_API_KEY`
- `LOGFLARE_SOURCE_TOKEN` or `LOGFLARE_SOURCE_NAME`
- `LOGFLARE_SERVER_ENABLED=true` to enable server logging
- `LOGFLARE_EDGE_ENABLED=true` to enable edge forwarding
- `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED=true` to enable browser forwarding

**Notes:**

- Browser logs are forwarded to `/api/logs`. Disable browser forwarding in production unless you accept public ingest.
- Edge ingest can be protected with `LOG_INGEST_SECRET` (see ENV requirements).

## Upstash (Rate Limiting)

**Website:** https://upstash.com

**Purpose:** Global API rate limiting via Redis.

**Setup:**

1. Create an Upstash Redis database.
2. Copy the REST URL and REST token.
3. Set these environment variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `API_RATE_LIMIT_REQUESTS` (e.g. `10`)
- `API_RATE_LIMIT_WINDOW` (e.g. `60 s`)

**Notes:**

- Rate limiting is enforced in `src/proxy.ts` for `/api/*` routes.
- In development, a local fallback rate limiter is used when Upstash is not configured.

## Chromatic (Storybook)

**Website:** https://www.chromatic.com

**Purpose:** CI visual regression testing for Storybook.

**Setup:**

1. Create a Chromatic project.
2. Copy the project token.
3. Set this environment variable:

- `CHROMATIC_PROJECT_TOKEN`

**Notes:**

- Used only in CI for `pnpm chromatic`.

## Release Automation (Semantic Release)

**Website:** https://semantic-release.gitbook.io/semantic-release

**Purpose:** Automated versioning and release on CI.

**Setup:**

1. Configure a GitHub App or token for semantic-release.
2. Set the required CI secrets:

- `SEMANTIC_RELEASE_GITHUB_APP_ID`
- `SEMANTIC_RELEASE_GITHUB_APP_PRIVATE_KEY`

**Notes:**

- Used only in CI pipelines.
