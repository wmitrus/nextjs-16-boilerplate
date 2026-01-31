# Environment Requirements

This document lists the environment variables required (or optional) to run the project. Update this file whenever new variables are added.

---

## Required for Local Development

Create a local file:

```bash
pnpm env:init
```

Then validate it:

```bash
pnpm env:check
```

---

## Required Variables

### Server-side

| Variable   | Required | Purpose      | Example       |
| ---------- | -------- | ------------ | ------------- |
| `NODE_ENV` | Yes      | Runtime mode | `development` |

### Client-side (must be prefixed with `NEXT_PUBLIC_`)

| Variable                  | Required | Purpose                     | Example               |
| ------------------------- | -------- | --------------------------- | --------------------- |
| `NEXT_PUBLIC_APP_URL`     | No       | Public base URL             | `https://example.com` |
| `NEXT_PUBLIC_E2E_ENABLED` | No       | Enable test-only UI for E2E | `true`                |

---

## Optional Variables

### Server-side

| Variable                   | Required | Purpose                          | Example |
| -------------------------- | -------- | -------------------------------- | ------- |
| `CHROMATIC_PROJECT_TOKEN`  | No       | Chromatic uploads in CI          | `...`   |
| `LOG_LEVEL`                | No       | Pino log level                   | `info`  |
| `LOG_DIR`                  | No       | Log directory (server)           | `logs`  |
| `LOG_TO_FILE_DEV`          | No       | Enable file logging in dev       | `false` |
| `LOG_TO_FILE_PROD`         | No       | Enable file logging in prod      | `false` |
| `LOGFLARE_API_KEY`         | No       | Logflare API key                 | `...`   |
| `LOGFLARE_SOURCE_TOKEN`    | No       | Logflare source token            | `...`   |
| `LOGFLARE_SOURCE_NAME`     | No       | Logflare source name (optional)  | `...`   |
| `LOGFLARE_SERVER_ENABLED`  | No       | Enable server Logflare transport | `false` |
| `LOGFLARE_EDGE_ENABLED`    | No       | Enable edge Logflare forwarding  | `false` |
| `LOG_INGEST_SECRET`        | No       | Shared secret for edge ingest    | `...`   |
| `UPSTASH_REDIS_REST_URL`   | No       | Upstash Redis REST URL           | `...`   |
| `UPSTASH_REDIS_REST_TOKEN` | No       | Upstash Redis REST token         | `...`   |
| `API_RATE_LIMIT_REQUESTS`  | No       | Rate limit requests per window   | `10`    |
| `API_RATE_LIMIT_WINDOW`    | No       | Rate limit window duration       | `60 s`  |
| `E2E_ENABLED`              | No       | Enable test-only routes for E2E  | `true`  |

### Release Automation (CI only)

| Variable                                  | Required | Purpose                              | Example                              |
| ----------------------------------------- | -------- | ------------------------------------ | ------------------------------------ |
| `SEMANTIC_RELEASE_GITHUB_APP_ID`          | Yes (CI) | GitHub App ID for release automation | `123456`                             |
| `SEMANTIC_RELEASE_GITHUB_APP_PRIVATE_KEY` | Yes (CI) | GitHub App private key (PEM)         | `-----BEGIN RSA PRIVATE KEY-----...` |

---

## Where to Set Variables

- **Local development**: `.env.local`
- **Example file**: `.env.example` (must include all keys in schema)
- **CI/CD**: GitHub Actions Secrets

---

## Source of Truth

All variables are defined and validated in `src/core/env.ts` using **@t3-oss/env-nextjs**.

When you add a new variable:

1. Add it to `src/core/env.ts` schema.
2. Add it to `.env.example`.
3. Add a real value in `.env.local` or CI Secrets.

---

## Vercel Preview & Production Requirements

### Preview Deployments

Required for stable preview builds:

- `NEXT_PUBLIC_APP_URL` (set to the preview URL if you rely on edge forwarding)

Optional but recommended:

- `LOGFLARE_SERVER_ENABLED`
- `LOGFLARE_EDGE_ENABLED`
- `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED`
- `LOGFLARE_API_KEY` + `LOGFLARE_SOURCE_TOKEN` or `LOGFLARE_SOURCE_NAME`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (if rate limiting is enabled)
- `LOG_INGEST_SECRET` (if edge ingest protection is enabled)

### Production Deployments

Required for production if features are enabled:

- `NEXT_PUBLIC_APP_URL`
- `LOGFLARE_API_KEY` + `LOGFLARE_SOURCE_TOKEN` or `LOGFLARE_SOURCE_NAME` (if Logflare is enabled)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (if global rate limiting is enabled)
- `LOG_INGEST_SECRET` (recommended for edge ingest protection)

Recommended defaults:

- `LOG_LEVEL=info`
- `LOGFLARE_SERVER_ENABLED=true`
- `LOGFLARE_EDGE_ENABLED=true`
- `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED=false` (enable only if you accept public browser ingest)

---

## Generating `LOG_INGEST_SECRET`

Generate a secure secret locally:

```bash
openssl rand -hex 32
```

Set it in `.env.local` or in Vercel Environment Variables as `LOG_INGEST_SECRET`.

Edge ingest requests must include:

```
x-log-ingest-secret: <your-secret>
```
