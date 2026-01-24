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

| Variable              | Required | Purpose         | Example               |
| --------------------- | -------- | --------------- | --------------------- |
| `NEXT_PUBLIC_APP_URL` | No       | Public base URL | `https://example.com` |

---

## Optional Variables

### Server-side

| Variable                  | Required | Purpose                 | Example |
| ------------------------- | -------- | ----------------------- | ------- |
| `CHROMATIC_PROJECT_TOKEN` | No       | Chromatic uploads in CI | `...`   |

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
