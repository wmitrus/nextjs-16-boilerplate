# Chromatic Integration

## Purpose

Chromatic is used for automated visual regression testing and hosting the project's Storybook. It ensures that UI changes are reviewed and approved before being merged into the main branch.

## High-level Behavior

- **Visual Regression Testing**: Every pull request triggers a Chromatic build that compares the current UI against the baseline.
- **Storybook Hosting**: Each build generates a unique URL where the Storybook for that specific commit can be viewed.
- **Review Workflow**: Team members can review and approve UI changes directly in the Chromatic web interface.

## Implementation

- **GitHub Action**: `.github/workflows/deployChromatic.yml` automates the deployment process.
- **CLI Tool**: The `chromatic` package is used to run builds from the command line or CI.
- **Configuration**: The integration uses `CHROMATIC_PROJECT_TOKEN` stored in GitHub Secrets and validated via `src/core/env.ts`.

## Environment Configuration

The project uses **T3-Env** for environment variable validation.

- **Server Variable**: `CHROMATIC_PROJECT_TOKEN` is defined in `src/core/env.ts`.
- **Validation**: Ensure `CHROMATIC_PROJECT_TOKEN` is set in your environment (local `.env.local` or CI Secrets).
- Run first buil to estabblish baselines
  `pnpm chromatic --project-token <your-project-token>`

## Usage

### Local Development

To run a Chromatic build locally (e.g., for troubleshooting):

```bash
export CHROMATIC_PROJECT_TOKEN=your_token_here
pnpm chromatic
```

### CI/CD Setup

1. **Get Project Token**: Create a new project in Chromatic and copy the `project-token`.
2. **Set GitHub Secret**:
   - Go to your GitHub repository **Settings > Secrets and variables > Actions**.
   - Click **New repository secret**.
   - Name: `CHROMATIC_PROJECT_TOKEN`.
   - Value: Paste your Chromatic project token.
3. **Automated Runs**: Chromatic will now run automatically on every push to `main` and on all pull requests targeting `main`.

## Verification

- Check the **Actions** tab in GitHub to see the status of the **Deploy Chromatic** workflow.
- Visit your Chromatic project dashboard to see the build history and visual comparisons.
