# CI/CD Implementation Plan

## Workflow Steps

### [x] Step 1: GitHub Rulesets

Fix governance first. Prevent PR from main, enforce required status checks, and set up branch protections.
See [./docs/sdd/03.1 - GitHub Rulesets.md](./docs/sdd/03.1%20-%20GitHub%20Rulesets.md) for details.

### [x] Step 2: pr-validation

Implement PR validation workflow. Becomes a required check.
Workflow implemented in [./.github/workflows/pr-validation.yml](./.github/workflows/pr-validation.yml).

### [x] Step 3: preview-deploy

Implement Vercel preview deployment workflow for instant feedback.
Workflow implemented in [./.github/workflows/preview-deploy.yml](./.github/workflows/preview-deploy.yml).

### [x] Step 4: prod-deploy

Implement Vercel production deployment workflow for controlled releases.
Workflow implemented in [./.github/workflows/prod-deploy.yml](./.github/workflows/prod-deploy.yml).

### [x] Deployment Documentation & Environment Setup

Updated environment requirements and created manual deployment guide.

- See [./docs/features/ENV-requirements.md](./docs/features/ENV-requirements.md)
- See [./docs/features/DEPLOY-manual.md](./docs/features/DEPLOY-manual.md)

### [x] Fix Middleware/Proxy Runtime Crash

Switched `src/proxy.ts` to use direct Edge logger to avoid Node.js module conflicts in Vercel runtime.

- Updated [./src/core/logger/edge.ts](./src/core/logger/edge.ts) to export `logger`.
- Updated [./src/proxy.ts](./src/proxy.ts) to use Edge logger.

### [x] Future Integrations & Validation

Validated playbooks and created migration/expansion guide.
See [./docs/sdd/03.2 - CI-CD Future Integrations.md](./docs/sdd/03.2%20-%20CI-CD%20Future%20Integrations.md).

### [x] Additional Pipelines

- [x] Lighthouse performance pipeline ([./.github/workflows/lighthouse.yml](./.github/workflows/lighthouse.yml))
- [x] Security-scan pipeline ([./.github/workflows/security-scan.yml](./.github/workflows/security-scan.yml))
- [x] Optional label-triggered E2E ([./.github/workflows/e2e-label.yml](./.github/workflows/e2e-label.yml))
