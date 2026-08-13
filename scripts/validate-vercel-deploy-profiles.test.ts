// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertVercelDeployProfilesValid,
  assertVercelPreviewSourceUploadValid,
} from './validate-vercel-deploy-profiles';

describe('assertVercelDeployProfilesValid', () => {
  it('accepts separate preview source and production prebuilt profiles', () => {
    expect(() =>
      assertVercelDeployProfilesValid('/docs\n/tests\n', '/src\n/docs\n'),
    ).not.toThrow();
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
        assertVercelDeployProfilesValid('/docs\n', `/src\n${runtimePath}\n`),
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
});
