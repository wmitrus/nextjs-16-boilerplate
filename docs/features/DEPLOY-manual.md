# Deployment Guide (Manual)

This guide provides step-by-step instructions for deploying the project to **Vercel** for the first time.

## 1. Prerequisites

Before starting, ensure you have accounts and projects ready on:

- [GitHub](https://github.com) (for source control)
- [Vercel](https://vercel.com) (for hosting)
- [Clerk](https://clerk.com) (for authentication)
- [Upstash](https://upstash.com) (optional, for Redis/Rate limiting)
- [Logflare](https://logflare.app) (optional, for logging)
- [Chromatic](https://chromatic.com) (optional, for UI testing)

## 2. Infrastructure Setup

### Clerk (Auth)

1. Create a new project in Clerk.
2. Go to **Developers > API Keys** and copy the `Publishable Key` and `Secret Key`.
3. In Clerk Dashboard, configure the URLs (Sign-in, Sign-up, etc.) to match the project defaults in `src/core/env.ts`.

### Upstash (Redis)

1. Create a Redis database.
2. Copy the `REST URL` and `REST Token`.

## 3. GitHub Configuration

1. Create a new repository and push the code.
2. Navigate to **Settings > Secrets and variables > Actions**.
3. Add the following secrets:
   - `VERCEL_TOKEN`: Create one at [vercel.com/account/tokens](https://vercel.com/account/tokens).
   - `VERCEL_ORG_ID`: Found in Vercel Team settings or via `vercel link`.
   - `VERCEL_PROJECT_ID`: Found in Vercel Project settings or via `vercel link`.
   - `VERCEL_AUTOMATION_BYPASS_SECRET`: Any secure random string (used by Lighthouse).
   - `LHCI_TOKEN`: Build token from your Lighthouse CI server.
   - `CHROMATIC_PROJECT_TOKEN`: From your Chromatic project settings.
   - `CLERK_SECRET_KEY`: From Clerk dashboard.
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: From Clerk dashboard.
   - `SEMANTIC_RELEASE_GITHUB_APP_ID`: From your GitHub App for releases.
   - `SEMANTIC_RELEASE_GITHUB_APP_PRIVATE_KEY`: Private key for that GitHub App.

## 4. Vercel Project Setup

### Option A: Create via Vercel Dashboard (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import your GitHub repository.
3. **Configure Project**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `pnpm build` (Vercel usually detects this)
   - **Output Directory**: `.next`
4. **Environment Variables**: Expand this section and add the required keys from [ENV-requirements.md](./ENV-requirements.md).
5. Click **Deploy**.
6. Once created, go to **Settings > General** and copy the **Project ID** and **Organization ID** for your GitHub Secrets.

### Option B: Create via Vercel CLI

Run the following locally to create and link the project:

1. Install CLI: `pnpm install -g vercel`
2. Log in: `vercel login`
3. Initialize: `vercel link`
   - Set up "your-project"? **Yes**
   - Which scope? **[Your Team/User]**
   - Link to existing project? **No**
   - What's your project's name? **your-project**
   - In which directory is your code located? `./`
4. This creates `.vercel/project.json`. Open it to find your `orgId` and `projectId`.

### Finalizing CI/CD Connection

1. Take the `orgId` and `projectId` from Step 4 and add them to your GitHub Repository Secrets as `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.
2. Generate a Vercel Token at [vercel.com/account/tokens](https://vercel.com/account/tokens) and add it to GitHub as `VERCEL_TOKEN`.

## 5. Deployment Flow

### Automatic (Recommended)

Opening or updating a PR to `main` triggers a **Preview Deployment** (see `preview-deploy.yml`).
Merging into `main` triggers a **Production Deployment** (see `prod-deploy.yml`).

### Manual CLI Deployment (Emergency only)

To deploy from your local machine:

```bash
# Preview
vercel deploy

# Production
vercel deploy --prod
```

## 6. Post-Deployment Verification

1. Verify the site loads and redirects to the Clerk login if protected.
2. Check the **GitHub Actions** tab to ensure all validation checks (Lint, Typecheck, Tests) passed.
3. Review the **Lighthouse** report in the PR comments or CI logs.

## 7. Troubleshooting

### 500: MIDDLEWARE_INVOCATION_FAILED

This is usually caused by a crash during the initialization of `proxy.ts`.

1. **Verify Environment Variables**:
   - The project uses **strict validation**. Go to your Vercel Project > **Logs**.
   - Look for a `ZodError`. It will tell you exactly which variable is missing (e.g., `CLERK_SECRET_KEY`).
2. **Mandatory Clerk Keys**:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - These **must** be present in Vercel Environment Variables for the app to start.
3. **Runtime Compatibility**:
   - Ensure `proxy.ts` is not importing any Node.js-only modules (like `fs` or `path`) indirectly. (The project is configured to use the Edge-safe logger in `proxy.ts` to prevent this).
