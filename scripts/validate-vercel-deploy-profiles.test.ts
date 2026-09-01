// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertVercelDeployProfilesValid,
  assertVercelDeploymentIdContractValid,
  assertNextRuntimeTraceGuardValid,
  assertVercelRuntimeSmokeConfigValid,
  assertVercelPreviewSourceUploadValid,
  assertVercelProductionConcurrencyContractValid,
  assertVercelProductionMigrationOwnershipValid,
  assertVercelProductionReadinessVerificationValid,
  assertVercelToolingAndProvenanceValid,
} from './validate-vercel-deploy-profiles';

describe('assertVercelDeployProfilesValid', () => {
  it('accepts separate preview source and production prebuilt profiles', () => {
    expect(() =>
      assertVercelDeployProfilesValid(
        '/docs\n/tests\n',
        [
          '/docs',
          '!/.env.example',
          '!/.env.leantime.example',
          '!/.env.leantime-dev.example',
        ].join('\n'),
      ),
    ).not.toThrow();
  });

  it('rejects a prebuilt profile missing a tracked public env template', () => {
    expect(() =>
      assertVercelDeployProfilesValid(
        '/docs\n',
        ['!/.env.example', '!/.env.leantime.example'].join('\n'),
      ),
    ).toThrow('.env.leantime-dev.example');
  });

  it('rejects a default profile that excludes preview source files', () => {
    expect(() =>
      assertVercelDeployProfilesValid('/src\n/docs\n', '/src\n/docs\n'),
    ).toThrow('must include src');
  });

  it.each(['/node_modules', 'node_modules', '/.next', '.next', '/src', 'src'])(
    'rejects a prebuilt profile that excludes traced runtime path %s',
    (runtimePath) => {
      expect(() =>
        assertVercelDeployProfilesValid(
          '/docs\n',
          [
            runtimePath,
            '!/.env.example',
            '!/.env.leantime.example',
            '!/.env.leantime-dev.example',
          ].join('\n'),
        ),
      ).toThrow('must not exclude');
    },
  );
});

describe('assertVercelPreviewSourceUploadValid', () => {
  it('accepts a source upload containing required build inputs', () => {
    const dryRunOutput = JSON.stringify({
      files: [
        'next.config.ts',
        'package.json',
        'e2e/env-files.ts',
        'e2e/internal-api-key.ts',
        'src/core/db/migrations/generated/meta/_journal.json',
      ],
      ignored: [],
    });

    expect(() =>
      assertVercelPreviewSourceUploadValid(dryRunOutput),
    ).not.toThrow();
  });

  it('rejects a source upload missing migration inputs', () => {
    const dryRunOutput = JSON.stringify({
      files: ['next.config.ts', 'package.json'],
      ignored: ['src'],
    });

    expect(() => assertVercelPreviewSourceUploadValid(dryRunOutput)).toThrow(
      'src/core/db/migrations/generated/meta/_journal.json',
    );
  });

  it('rejects a source upload missing Playwright configuration imports', () => {
    const dryRunOutput = JSON.stringify({
      files: [
        'next.config.ts',
        'package.json',
        'e2e/env-files.ts',
        'src/core/db/migrations/generated/meta/_journal.json',
      ],
      ignored: ['e2e/internal-api-key.ts'],
    });

    expect(() => assertVercelPreviewSourceUploadValid(dryRunOutput)).toThrow(
      'e2e/internal-api-key.ts',
    );
  });
});

describe('assertVercelProductionMigrationOwnershipValid', () => {
  it('accepts the production workflow with Vercel as the only migration owner', () => {
    const workflowContent = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/prod-deploy.yml'),
      'utf8',
    );

    expect(() =>
      assertVercelProductionMigrationOwnershipValid(workflowContent),
    ).not.toThrow();
    expect(workflowContent).toContain('pnpm vercel:deploy:validate');
  });

  it('rejects a workflow that runs migrations separately from the project build command', () => {
    expect(() =>
      assertVercelProductionMigrationOwnershipValid(
        'pnpm db:migrate:prod\npnpm exec vercel build --prod',
      ),
    ).toThrow('must not run pnpm db:migrate:prod separately');
  });
});

describe('assertVercelProductionConcurrencyContractValid', () => {
  const validBlock = [
    'concurrency:',
    '  group: production-deployment',
    '  cancel-in-progress: false',
  ].join('\n');

  it('accepts the real prod-deploy.yml', () => {
    const workflowContent = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/prod-deploy.yml'),
      'utf8',
    );

    expect(() =>
      assertVercelProductionConcurrencyContractValid(workflowContent),
    ).not.toThrow();
  });

  it('accepts a minimal top-level concurrency block (order and comments tolerated)', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        [
          'name: Production Deployment',
          'concurrency:',
          '  cancel-in-progress: false # never cancel an in-flight deploy',
          "  group: 'production-deployment'",
          'jobs:',
          '  deploy:',
          '    runs-on: ubuntu-latest',
        ].join('\n'),
      ),
    ).not.toThrow();
  });

  it('accepts an unrelated direct sibling key that does not affect the contract', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        [
          'concurrency:',
          '  group: production-deployment',
          '  cancel-in-progress: false',
          '  future-note: ignored',
          'jobs: {}',
        ].join('\n'),
      ),
    ).not.toThrow();
  });

  it('rejects a workflow with no concurrency block', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        'name: Production Deployment\njobs:\n  deploy:\n    runs-on: ubuntu-latest',
      ),
    ).toThrow('top-level concurrency block');
  });

  it('rejects a wrong concurrency group', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        'concurrency:\n  group: prod\n  cancel-in-progress: false',
      ),
    ).toThrow('group must be exactly');
  });

  it('rejects cancel-in-progress: true', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        'concurrency:\n  group: production-deployment\n  cancel-in-progress: true',
      ),
    ).toThrow('must be exactly false');
  });

  it('rejects a missing cancel-in-progress key', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        'concurrency:\n  group: production-deployment',
      ),
    ).toThrow('exactly one direct "cancel-in-progress"');
  });

  it('rejects an only job-level / indented concurrency block', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        [
          'jobs:',
          '  deploy-production:',
          '    concurrency:',
          '      group: production-deployment',
          '      cancel-in-progress: false',
          '    runs-on: ubuntu-latest',
        ].join('\n'),
      ),
    ).toThrow('must be a TOP-LEVEL block');
  });

  // Corrective pass: the required keys must be DIRECT children of the
  // top-level concurrency block, not nested descendants.
  it('rejects group/cancel-in-progress nested under an intervening child key', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        [
          'concurrency:',
          '  bogus:',
          '    group: production-deployment',
          '    cancel-in-progress: false',
        ].join('\n'),
      ),
    ).toThrow('exactly one direct "group"');
  });

  it('rejects a duplicate direct group key', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        [
          'concurrency:',
          '  group: production-deployment',
          '  group: production-deployment',
          '  cancel-in-progress: false',
        ].join('\n'),
      ),
    ).toThrow('exactly one direct "group"');
  });

  it('rejects a duplicate direct cancel-in-progress key', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        [
          'concurrency:',
          '  group: production-deployment',
          '  cancel-in-progress: false',
          '  cancel-in-progress: false',
        ].join('\n'),
      ),
    ).toThrow('exactly one direct "cancel-in-progress"');
  });

  it('rejects multiple top-level concurrency blocks', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(
        [
          'concurrency:',
          '  group: production-deployment',
          '  cancel-in-progress: false',
          'concurrency:',
          '  group: production-deployment',
          '  cancel-in-progress: false',
        ].join('\n'),
      ),
    ).toThrow('exactly one top-level concurrency block');
  });

  it('validBlock fixture is itself accepted', () => {
    expect(() =>
      assertVercelProductionConcurrencyContractValid(validBlock),
    ).not.toThrow();
  });
});

describe('assertVercelProductionReadinessVerificationValid', () => {
  it('accepts the production workflow hosted deployment readiness gate', () => {
    const workflowContent = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/prod-deploy.yml'),
      'utf8',
    );

    expect(() =>
      assertVercelProductionReadinessVerificationValid(workflowContent),
    ).not.toThrow();
  });

  it('rejects a workflow that does not inspect the deployed prebuilt artifact', () => {
    expect(() =>
      assertVercelProductionReadinessVerificationValid(
        "pnpm exec vercel deploy --prebuilt --prod --skip-domain\nreadyState: 'READY'\ntarget: 'production'",
      ),
    ).toThrow('must inspect the deployed prebuilt artifact');
  });

  it('rejects a workflow whose inspected production deployment is not prebuilt', () => {
    expect(() =>
      assertVercelProductionReadinessVerificationValid(
        './node_modules/.bin/vercel build --prod\npnpm tenant:readiness:vercel:prod\n./node_modules/.bin/vercel deploy --prebuilt --prod --dry --json\n./node_modules/.bin/vercel deploy --prod --skip-domain --yes --json\nDEPLOY_URL=$(node -e)\ninspect "${{ steps.vercel_deploy.outputs.production_url }}" --wait --json\nreadyState: \'READY\'\ntarget: \'production\'\npnpm vercel:runtime:smoke\n./node_modules/.bin/vercel promote "${{ steps.vercel_deploy.outputs.production_url }}"',
      ),
    ).toThrow(
      './node_modules/.bin/vercel deploy --prebuilt --prod --skip-domain --yes --json',
    );
  });

  it('rejects a workflow that assumes inspect returns prebuilt metadata', () => {
    expect(() =>
      assertVercelProductionReadinessVerificationValid(
        './node_modules/.bin/vercel build --prod\npnpm tenant:readiness:vercel:prod\n./node_modules/.bin/vercel deploy --prebuilt --prod --skip-domain --yes --json\nDEPLOY_URL=$(node -e)\ninspect "${{ steps.vercel_deploy.outputs.production_url }}" --wait --json\nreadyState: \'READY\'\ntarget: \'production\'\npnpm vercel:runtime:smoke\n./node_modules/.bin/vercel promote "${{ steps.vercel_deploy.outputs.production_url }}"\ndeployment.prebuilt',
      ),
    ).toThrow('must not require deployment.prebuilt');
  });
});

describe('assertVercelToolingAndProvenanceValid', () => {
  const preview = [
    'ref: ${{ github.event.pull_request.head.sha }}',
    'test "$(git rev-parse HEAD)" = "$PREVIEW_GIT_SHA"',
    './node_modules/.bin/vercel deploy --yes --json',
    'if [ $DEPLOY_EXIT -ne 0 ]; then',
    'pnpm vercel:deploy:diagnose -- /tmp/vercel-preview-deploy.json',
    'pnpm neon:preview:check -- --git-branch="$PREVIEW_GIT_BRANCH" --cleanup-obsolete',
    'NEON_API_KEY: ${{ secrets.NEON_API_KEY }}',
    'NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}',
    'pnpm exec playwright install --with-deps chromium',
    'pnpm vercel:runtime:smoke',
    'name: Verify Preview Runtime',
    'needs: deploy-preview',
    'PLAYWRIGHT_TEST_BASE_URL: ${{ needs.deploy-preview.outputs.preview_url }}',
  ].join('\n');
  const production = [
    'VERCEL_PREBUILT_DEPLOYMENT_ID: ${{ github.run_id }}-${{ github.run_attempt }}',
    'if [ -n "${NEXT_DEPLOYMENT_ID:-}" ]; then exit 1; fi',
    'VERCEL_PREBUILT_DEPLOYMENT_ID="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    './node_modules/.bin/vercel build --prod',
    'pnpm tenant:readiness:vercel:prod',
    '--meta githubCommitSha="$GITHUB_SHA"',
    'pnpm exec playwright install --with-deps chromium',
    'pnpm vercel:runtime:smoke',
  ].join('\n');

  it('accepts pinned CLI and immutable deployment provenance guards', () => {
    expect(() =>
      assertVercelToolingAndProvenanceValid(
        JSON.stringify({ devDependencies: { vercel: '59.0.0' } }),
        preview,
        production,
      ),
    ).not.toThrow();
  });

  it('rejects floating Vercel CLI resolution', () => {
    expect(() =>
      assertVercelToolingAndProvenanceValid(
        JSON.stringify({ devDependencies: { vercel: '^59.0.0' } }),
        preview,
        production,
      ),
    ).toThrow('pinned');
  });
});

describe('assertVercelDeploymentIdContractValid', () => {
  const nextConfig = 'deploymentId: process.env.VERCEL_PREBUILT_DEPLOYMENT_ID';
  const workflow = [
    'VERCEL_PREBUILT_DEPLOYMENT_ID: ${{ github.run_id }}-${{ github.run_attempt }}',
    'if [ -n "${NEXT_DEPLOYMENT_ID:-}" ]; then exit 1; fi',
    'export VERCEL_PREBUILT_DEPLOYMENT_ID="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
  ].join('\n');

  it('accepts an embedded custom prebuilt deployment ID', () => {
    expect(() =>
      assertVercelDeploymentIdContractValid(nextConfig, workflow),
    ).not.toThrow();
  });

  it('rejects using the reserved runtime deployment ID as build input', () => {
    expect(() =>
      assertVercelDeploymentIdContractValid(
        'deploymentId: process.env.NEXT_DEPLOYMENT_ID',
        'export NEXT_DEPLOYMENT_ID="build-id"',
      ),
    ).toThrow('reserved');
  });

  it('rejects enabling runtime deployment ID resolution explicitly', () => {
    expect(() =>
      assertVercelDeploymentIdContractValid(
        `${nextConfig}\nexperimental: { runtimeServerDeploymentId: true }`,
        workflow,
      ),
    ).toThrow('reserved');
  });

  it('rejects assigning the reserved runtime ID through workflow YAML', () => {
    expect(() =>
      assertVercelDeploymentIdContractValid(
        nextConfig,
        `${workflow}\nenv:\n  NEXT_DEPLOYMENT_ID: forced`,
      ),
    ).toThrow('reserved');
  });

  it('requires a guard against a dashboard-defined reserved variable', () => {
    expect(() =>
      assertVercelDeploymentIdContractValid(
        nextConfig,
        'VERCEL_PREBUILT_DEPLOYMENT_ID: ${{ github.run_id }}-${{ github.run_attempt }}\nexport VERCEL_PREBUILT_DEPLOYMENT_ID="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
      ),
    ).toThrow('fail before building');
  });
});

describe('assertVercelRuntimeSmokeConfigValid', () => {
  it('accepts a smoke config restricted to the hosted runtime spec', () => {
    expect(() =>
      assertVercelRuntimeSmokeConfigValid(
        "testDir: './e2e', testMatch: 'vercel-runtime-smoke.spec.ts'",
      ),
    ).not.toThrow();
  });

  it('rejects a config that would run the full E2E directory', () => {
    expect(() =>
      assertVercelRuntimeSmokeConfigValid("testDir: './e2e'"),
    ).toThrow('full E2E suite');
  });
});

describe('assertNextRuntimeTraceGuardValid', () => {
  it('accepts framework-owned output file tracing', () => {
    expect(() => assertNextRuntimeTraceGuardValid('{}')).not.toThrow();
  });

  it.each(['outputFileTracingIncludes', 'outputFileTracingExcludes'])(
    'rejects a repository-wide %s override',
    (option) => {
      expect(() =>
        assertNextRuntimeTraceGuardValid(`${option}: { '/*': ['logs/**/*'] }`),
      ).toThrow('must remain automatic');
    },
  );
});
