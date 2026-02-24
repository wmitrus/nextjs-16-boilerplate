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

## Local Environment (.env.local)

These are used by `pnpm env:init` and validated by `pnpm env:check`.

### Required (Local + Vercel)

| Variable                            | Required | Purpose           | Example       |
| ----------------------------------- | -------- | ----------------- | ------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes      | Clerk public key  | `pk_test_...` |
| `CLERK_SECRET_KEY`                  | Yes      | Clerk private key | `sk_test_...` |

### Optional (Local + Vercel)

| Variable                                          | Default       | Purpose                                                     |
| ------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | `/sign-in`    | URL for sign-in page                                        |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                   | `/sign-up`    | URL for sign-up page                                        |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/`           | Where to go after sign-in                                   |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/`           | Where to go after sign-up                                   |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`    | `/onboarding` | Forced redirect after sign-up                               |
| `NEXT_PUBLIC_CLERK_WAITLIST_URL`                  | `/waitlist`   | URL for the waitlist page                                   |
| `NEXT_PUBLIC_APP_URL`                             | -             | Public base URL                                             |
| `NEXT_PUBLIC_E2E_ENABLED`                         | -             | Enable test-only UI for E2E                                 |
| `UPSTASH_REDIS_REST_URL`                          | -             | Upstash Redis REST URL                                      |
| `UPSTASH_REDIS_REST_TOKEN`                        | -             | Upstash Redis REST token                                    |
| `API_RATE_LIMIT_REQUESTS`                         | `10`          | API rate limit requests                                     |
| `API_RATE_LIMIT_WINDOW`                           | `60 s`        | API rate limit window                                       |
| `LOGFLARE_API_KEY`                                | -             | Logflare API key                                            |
| `LOGFLARE_SOURCE_TOKEN`                           | -             | Logflare source token                                       |
| `LOGFLARE_SOURCE_NAME`                            | -             | Logflare source name                                        |
| `LOG_LEVEL`                                       | `info`        | Pino log level                                              |
| `LOG_INGEST_SECRET`                               | -             | Shared secret for edge ingest                               |
| `INTERNAL_API_KEY`                                | -             | Secret for /api/internal access                             |
| `SECURITY_AUDIT_LOG_ENABLED`                      | `true`        | Toggle mutation audit logging                               |
| `SECURITY_ALLOWED_OUTBOUND_HOSTS`                 | -             | Comma-separated list of allowed hosts                       |
| `NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED`            | `false`       | Browser log forwarding via `/api/logs`                      |
| `NEXT_PUBLIC_CSP_SCRIPT_EXTRA`                    | -             | Extra origins for CSP script-src                            |
| `NEXT_PUBLIC_CSP_CONNECT_EXTRA`                   | -             | Extra origins for CSP connect-src                           |
| `NEXT_PUBLIC_CSP_FRAME_EXTRA`                     | -             | Extra origins for CSP frame-src                             |
| `NEXT_PUBLIC_CSP_IMG_EXTRA`                       | -             | Extra origins for CSP img-src                               |
| `NEXT_PUBLIC_CSP_FONT_EXTRA`                      | -             | Extra origins for CSP font-src                              |
| `NEXT_PUBLIC_CSP_STYLE_EXTRA`                     | -             | Extra origins for CSP style-src                             |
| `CHROMATIC_PROJECT_TOKEN`                         | -             | Chromatic uploads in CI                                     |
| `NODE_ENV`                                        | `development` | Runtime mode                                                |
| `VERCEL_ENV`                                      | -             | Vercel environment (prod/preview/dev)                       |
| `SECURITY_ALLOWED_OUTBOUND_HOSTS`                 | See env.ts    | Allowed hosts for secureFetch                               |
| `SECURITY_AUDIT_LOG_ENABLED`                      | `true`        | Enable security audit logging                               |
| `INTERNAL_API_KEY`                                | -             | Key for internal API routes (Gen: `pnpm generate:secret`)   |
| `LOG_INGEST_SECRET`                               | -             | Shared secret for edge ingest (Gen: `pnpm generate:secret`) |

---

## Vercel Environment Variables

Set these in **Vercel Project Settings > Environment Variables** for Preview and Production as needed.

Use the same variables as **Local Environment** plus any production values (real Clerk keys, Upstash, Logflare). The following are the minimum required for the app to boot:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

---

## GitHub Actions: Secrets

Set these in **GitHub Settings > Secrets and variables > Actions**.

### Required for Vercel Deployments

| Secret                            | Purpose                                 |
| --------------------------------- | --------------------------------------- |
| `VERCEL_TOKEN`                    | Vercel Access Token                     |
| `VERCEL_ORG_ID`                   | Vercel Organization ID                  |
| `VERCEL_PROJECT_ID`               | Vercel Project ID                       |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Bypass Vercel Protection for Lighthouse |
| `LHCI_TOKEN`                      | Lighthouse CI build token               |

**LHCI note:** Configure your LHCI server URL via `LHCI_SERVER_BASE_URL`. See [CI/CD & Lighthouse CI](./19%20-%20CI-CD%20%26%20Lighthouse%20CI.md) for full setup.

### Required for Automated Releases

| Secret                                    | Purpose                              |
| ----------------------------------------- | ------------------------------------ |
| `SEMANTIC_RELEASE_GITHUB_APP_ID`          | GitHub App ID for automated releases |
| `SEMANTIC_RELEASE_GITHUB_APP_PRIVATE_KEY` | Private key for automated releases   |

### Optional

| Secret                    | Purpose                             |
| ------------------------- | ----------------------------------- |
| `CHROMATIC_PROJECT_TOKEN` | Storybook visual regression testing |

---

## GitHub Actions: Variables

Set these in **GitHub Settings > Secrets and variables > Actions**.

| Variable               | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `LHCI_SERVER_BASE_URL` | LHCI server URL used by `lighthouserc`  |
| `PRODUCTION_URL`       | Production URL for scheduled Lighthouse |

---

## Source of Truth

All variables are defined and validated in `src/core/env.ts` using **@t3-oss/env-nextjs**.
