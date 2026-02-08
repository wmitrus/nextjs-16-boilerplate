# CI/CD & Lighthouse CI

This document describes the CI/CD workflows in this repository and how to integrate Lighthouse CI (LHCI) with a self-hosted LHCI server. All examples use placeholders so you can apply them to any repository.

## CI/CD Overview

The CI/CD setup is implemented with GitHub Actions. It covers:

- PR quality gates (lint, typecheck, tests, env checks, dependency checks).
- Preview deployments to Vercel with Lighthouse CI audits.
- Production deployments to Vercel on main.
- Release automation via semantic-release.
- Security scanning (dependency audit + secret scanning).
- Visual regression testing via Chromatic.
- Optional E2E execution triggered by a PR label.
- PR labeling and auto-assignment for workflow hygiene.

## Workflow Inventory

- PR validation: [Quality checks on pull requests](.github/workflows/pr-validation.yml).
- Preview deployment: [Vercel preview + LHCI audit](.github/workflows/preview-deploy.yml).
- Production deployment: [Vercel production deploy](.github/workflows/prod-deploy.yml).
- Release automation: [semantic-release on main](.github/workflows/release.yml).
- Security scan: [dependency + secrets scan](.github/workflows/security-scan.yml).
- Lighthouse schedule: [scheduled production audit](.github/workflows/lighthouse.yml).
- Chromatic: [visual regression on Storybook](.github/workflows/deployChromatic.yml).
- Label-triggered E2E: [run Playwright on label](.github/workflows/e2e-label.yml).
- PR labeling: [apply labels on PR events](.github/workflows/label.yml).
- PR auto-assign: [assign reviewers/assignees](.github/workflows/auto-assign.yml).

## Key Pipeline Behaviors

- **PR Validation** runs on pull requests to `main` and blocks PRs originating from `main`.
- **Preview Deploy** builds a preview using Vercel, posts the preview URL, and runs LHCI against it.
- **Production Deploy** runs on pushes to `main` and skips docs-only changes.
- **Release** runs semantic-release on `main` using a GitHub App token.
- **Security Scan** runs on `main`, PRs, and weekly schedules.
- **Lighthouse Schedule** runs weekly (and manually) against a configured production URL.
- **Chromatic** runs on changes to Storybook and UI code; auto-accepts changes on `main`.
- **E2E Label** runs when a PR is labeled `run-e2e`.

## Required Secrets and Variables

Configure these in your GitHub repository settings:

- **Vercel:** `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`.
- **Vercel bypass (preview audits):** `VERCEL_AUTOMATION_BYPASS_SECRET`.
- **LHCI:** `LHCI_TOKEN` (build token from LHCI server).
- **Chromatic:** `CHROMATIC_PROJECT_TOKEN`.
- **Release:** `SEMANTIC_RELEASE_GITHUB_APP_ID`, `SEMANTIC_RELEASE_GITHUB_APP_PRIVATE_KEY`.
- **E2E (if used):** `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, plus any app-specific envs.
- **Optional:** `PRODUCTION_URL` as a repository variable for scheduled Lighthouse audits.

GitHub provides `GITHUB_TOKEN` automatically.

Add this repository variable for LHCI:

```bash
LHCI_SERVER_BASE_URL=https://lighthouse.example.com
```

## Lighthouse CI Integration

LHCI is used in two places:

- **Preview Deploy**: Runs `@lhci/cli autorun` against the newly deployed Vercel preview URL.
- **Scheduled Production Audit**: Runs a weekly Lighthouse CI audit against `PRODUCTION_URL`.

The LHCI upload target is configured in [lighthouserc.json](lighthouserc.json). Set `LHCI_SERVER_BASE_URL` to your LHCI server URL and keep `token` wired to `LHCI_TOKEN`.

## Add a New Project to Your LHCI Server

1. **Install the LHCI CLI**

   ```bash
   npm install -g @lhci/cli@0.15.1
   ```

2. **Run the LHCI wizard**

   ```bash
   lhci wizard
   ```

   Choose the `new-project` wizard and provide:
   - LHCI server URL: `https://lighthouse.example.com`
   - Project name: `your-project-name`
   - Repo URL: `https://github.com/your-org/your-repo`
   - Main branch: `main`

   The wizard returns two tokens:
   - **Build token**: use in CI as `LHCI_TOKEN`.
   - **Admin token**: keep private for server-side management only.

3. **Configure repo secrets**
   - Add `LHCI_TOKEN` to GitHub Actions secrets.

4. **Point the repo to your LHCI server**

   Set `LHCI_SERVER_BASE_URL` in GitHub Actions variables (or your local shell). The config uses that value in [lighthouserc.json](lighthouserc.json):

   ```json
   {
     "ci": {
       "upload": {
         "target": "lhci",
         "serverBaseUrl": "${LHCI_SERVER_BASE_URL}",
         "token": "${LHCI_TOKEN}"
       }
     }
   }
   ```

5. **Verify in CI**
   - Open a PR to trigger the preview deployment workflow.
   - Confirm the LHCI build appears in your LHCI server.

## Optional: Local LHCI Smoke Test

You can test locally by running a manual collect/upload:

```bash
lhci collect --url=https://your-preview-url.example
lhci upload --serverBaseUrl=https://lighthouse.example.com --token=$LHCI_TOKEN
```

## WSL: Full Chrome Setup for LHCI

When running LHCI on WSL, install a Linux Chrome in WSL and run headless. Do not use the Windows Chrome binary.

### Install Chrome in WSL

```bash
sudo apt-get update
sudo apt-get install -y wget gnupg ca-certificates
wget -qO- https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-linux.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt-get update
sudo apt-get install -y google-chrome-stable
```

### Run LHCI Collect in WSL

```bash
export CHROME_PATH=/usr/bin/google-chrome

lhci collect \
   --url=https://your-deployed-app.example \
   --collect.numberOfRuns=3 \
   --collect.settings.chromeFlags="--headless=new --no-sandbox --disable-dev-shm-usage"
```

### Persist CHROME_PATH and Add a Short Alias

If you use LHCI often, add this to your shell profile (for example `~/.bashrc` or `~/.zshrc`):

```bash
export CHROME_PATH=/usr/bin/google-chrome
alias lhci-collect='lhci collect --collect.numberOfRuns=3 --collect.settings.chromeFlags="--headless=new --no-sandbox --disable-dev-shm-usage"'
```

Then reload your shell:

```bash
source ~/.bashrc
```

Usage:

```bash
lhci-collect --url=https://your-deployed-app.example
```

### Run LHCI Collect with Vercel Bypass

If your preview is protected by Vercel, pass the bypass headers:

```bash
export VERCEL_AUTOMATION_BYPASS_SECRET=your-secret

lhci collect \
   --url=https://your-deployed-app.example \
   --collect.numberOfRuns=3 \
   --collect.settings.chromeFlags="--headless=new --no-sandbox --disable-dev-shm-usage" \
   --collect.settings.extraHeaders='{"x-vercel-protection-bypass":"'"$VERCEL_AUTOMATION_BYPASS_SECRET"'","x-vercel-set-bypass-cookie":"samesitenone"}'
```

### Upload to LHCI Server

```bash
lhci upload --serverBaseUrl=https://lighthouse.example.com --token=$LHCI_TOKEN
```

### Troubleshooting

- If you see `Unable to connect to Chrome`, verify `CHROME_PATH` and run `google-chrome --version` inside WSL.
- If you get a `500` response, fix the deployed app first; LHCI only reports what it receives from the URL.
- For Vercel-protected previews, pass the bypass headers with `--collect.settings.extraHeaders`.

## Notes

- If you see npm deprecation warnings when installing `@lhci/cli`, they are coming from transitive dependencies in the CLI and do not affect LHCI functionality.
- Keep admin tokens out of CI and source control.
