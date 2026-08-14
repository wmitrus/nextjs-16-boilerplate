// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertVercelDeployProfilesValid,
  assertVercelPreviewSourceUploadValid,
  assertVercelProductionMigrationOwnershipValid,
  assertVercelProductionReadinessVerificationValid,
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

  it.each(['/node_modules', 'node_modules', '/.next', '.next'])(
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
        'pnpm db:migrate:prod\nnpm exec --yes vercel@latest -- build --prod',
      ),
    ).toThrow('must not run pnpm db:migrate:prod separately');
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
        "npm exec --yes vercel@latest -- deploy --prebuilt --prod\nreadyState: 'READY'\ntarget: 'production'",
      ),
    ).toThrow('must inspect the deployed prebuilt artifact');
  });

  it('rejects a workflow whose inspected production deployment is not prebuilt', () => {
    expect(() =>
      assertVercelProductionReadinessVerificationValid(
        "npm exec --yes vercel@latest -- deploy --prebuilt --prod --dry --json\nDEPLOY_URL=$(npm exec --yes vercel@latest -- deploy --prod)\ninspect \"${{ steps.vercel_deploy.outputs.production_url }}\" --wait --json\nreadyState: 'READY'\ntarget: 'production'",
      ),
    ).toThrow(
      'DEPLOY_URL=$(npm exec --yes vercel@latest -- deploy --prebuilt --prod',
    );
  });

  it('rejects a workflow that assumes inspect returns prebuilt metadata', () => {
    expect(() =>
      assertVercelProductionReadinessVerificationValid(
        "DEPLOY_URL=$(npm exec --yes vercel@latest -- deploy --prebuilt --prod)\ninspect \"${{ steps.vercel_deploy.outputs.production_url }}\" --wait --json\nreadyState: 'READY'\ntarget: 'production'\ndeployment.prebuilt",
      ),
    ).toThrow('must not require deployment.prebuilt');
  });
});
