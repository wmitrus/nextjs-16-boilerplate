# Intake

- Task ID: investigate-ci-migrations
- Request: Verify whether migrations are already being performed automatically during CI so the explicit migration steps in preview and production deploy workflows are not duplicated unnecessarily, then implement the resulting deployment fixes and close the review comments on those changes.
- Status: Completed

## Source Inputs

- User question about whether CI already runs migrations automatically
- .github/workflows/prod-deploy.yml
- .github/workflows/preview-deploy.yml
- package.json
- .github/workflows/db-tests.yml
- .github/workflows/e2e-matrix.yml
- .github/workflows/e2e-label.yml
- tests/db/setup.postgres.ts
- scripts/e2e/run-scenario.mjs
- scripts/db-ops.mjs
- src/testing/db/create-test-db.ts
- src/core/db/migrations/run-migrations.ts
- README.md
- docs/features/DEPLOY-neon.md
- README.md
- docs/features/19 - CI-CD & Lighthouse CI.md
- docs/features/DEPLOY-manual.md
- scripts/codacy-install.mjs
- vitest.shims.d.ts

## Readiness Checklist

- [x] Explicit deploy migration paths identified
- [x] Potential CI-side migration entrypoints identified
- [x] Runtime/build/install hooks inspected for implicit migrations
- [x] Final evidence summary synchronized with plan
- [x] Follow-up review comments resolved in code and docs
