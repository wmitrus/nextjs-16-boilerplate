import { describe, expect, it, vi } from 'vitest';

import {
  assertDatabaseHostBelongsToPreviewEndpoints,
  readOption,
  assertDatabaseUrlBelongsToPreviewEndpoints,
  assertTrustedProviderUrl,
  findOldestObsoletePreviewBranch,
  readNeonConfig,
} from './cli';

describe('assertDatabaseUrlBelongsToPreviewEndpoints', () => {
  const endpoint = 'ep-test.us-east-2.aws.neon.tech';

  it('accepts the direct endpoint host', () => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints(
        [endpoint],
        `postgres://user:password@${endpoint}/database`,
      ),
    ).not.toThrow();
  });

  it('accepts the corresponding pooled endpoint host', () => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints(
        [endpoint],
        'postgresql://user:password@ep-test-pooler.us-east-2.aws.neon.tech/database',
      ),
    ).not.toThrow();
  });

  it('rejects a different endpoint host', () => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints(
        [endpoint],
        'postgres://user:password@ep-other.us-east-2.aws.neon.tech/database',
      ),
    ).toThrow('does not belong');
  });

  it.each([
    'https://ep-test.us-east-2.aws.neon.tech/database',
    'mysql://ep-test.us-east-2.aws.neon.tech/database',
  ])('rejects a non-Postgres URL: %s', (databaseUrl) => {
    expect(() =>
      assertDatabaseUrlBelongsToPreviewEndpoints([endpoint], databaseUrl),
    ).toThrow('postgres or postgresql protocol');
  });
});

describe('assertDatabaseHostBelongsToPreviewEndpoints', () => {
  const endpoint = 'ep-test.us-east-2.aws.neon.tech';

  it('accepts exact and pooled endpoint hosts only', () => {
    expect(() =>
      assertDatabaseHostBelongsToPreviewEndpoints([endpoint], endpoint),
    ).not.toThrow();
    expect(() =>
      assertDatabaseHostBelongsToPreviewEndpoints(
        [endpoint],
        'ep-test-pooler.us-east-2.aws.neon.tech',
      ),
    ).not.toThrow();
  });

  it.each([
    'ep-main.us-east-2.aws.neon.tech',
    'ep-test.us-east-2.aws.neon.tech.attacker.test',
    'prefix-ep-test.us-east-2.aws.neon.tech',
    'anything.neon.tech',
  ])('rejects non-matching host: %s', (host) => {
    expect(() =>
      assertDatabaseHostBelongsToPreviewEndpoints([endpoint], host),
    ).toThrow('does not belong');
  });
});

describe('readOption', () => {
  it('accepts single inline and separated values', () => {
    expect(readOption(['--database-host=a'], '--database-host')).toBe('a');
    expect(readOption(['--database-host', 'a'], '--database-host')).toBe('a');
  });

  it.each([
    ['--database-host=a', '--database-host=b'],
    ['--database-host=a', '--database-host', 'b'],
    ['--git-branch=a', '--git-branch=b'],
  ])('rejects duplicate options: %s', (...args) => {
    const name = args[0].startsWith('--git-branch')
      ? '--git-branch'
      : '--database-host';
    expect(() => readOption(args, name)).toThrow('must not be specified twice');
  });

  it('rejects a missing separated value', () => {
    expect(() => readOption(['--database-host'], '--database-host')).toThrow(
      'requires a value',
    );
  });
});

describe('assertTrustedProviderUrl', () => {
  it('accepts only the exact HTTPS provider endpoint', () => {
    expect(() =>
      assertTrustedProviderUrl(
        new URL('https://console.neon.tech/api/v2/projects/project-1/branches'),
        { projectId: 'project-1', provider: 'neon' },
      ),
    ).not.toThrow();
  });

  it.each([
    'http://console.neon.tech/api/v2/projects/project-1/branches',
    'https://internal.example/api/v2/projects/project-1/branches',
    'https://console.neon.tech/api/v2/projects/project-2/branches',
    'https://user:password@console.neon.tech/api/v2/projects/project-1/branches',
    'https://console.neon.tech/api/v2/projects/project-1/branches?redirect=internal',
  ])('rejects an untrusted provider URL: %s', (value) => {
    expect(() =>
      assertTrustedProviderUrl(new URL(value), {
        projectId: 'project-1',
        provider: 'neon',
      }),
    ).toThrow('unexpected provider API URL');
  });
});

describe('readNeonConfig', () => {
  it('validates the dedicated Neon management environment', () => {
    vi.stubEnv('NEON_API_KEY', 'secret');
    vi.stubEnv('NEON_PROJECT_ID', 'project-123');
    vi.stubEnv('NEON_BRANCH_LIMIT', '10');

    expect(readNeonConfig()).toEqual({
      apiKey: 'secret',
      branchLimit: 10,
      projectId: 'project-123',
    });

    vi.unstubAllEnvs();
  });
});

describe('findOldestObsoletePreviewBranch', () => {
  const branches = [
    {
      created_at: '2026-08-12T10:00:00Z',
      id: 'br-main',
      name: 'main',
      default: true,
    },
    {
      created_at: '2026-08-13T10:00:00Z',
      id: 'br-old-active',
      name: 'preview/feature-active',
    },
    {
      created_at: '2026-08-11T10:00:00Z',
      id: 'br-old-obsolete',
      name: 'preview/feature-closed',
    },
    {
      created_at: '2026-08-10T10:00:00Z',
      id: 'br-current',
      name: 'preview/current-feature',
    },
  ];

  it('returns only the oldest preview whose GitHub branch no longer exists', async () => {
    const branchExists = vi.fn(async (name: string) => {
      return name === 'feature-active';
    });

    await expect(
      findOldestObsoletePreviewBranch(
        branches,
        'current-feature',
        branchExists,
      ),
    ).resolves.toMatchObject({ id: 'br-old-obsolete' });
    expect(branchExists).toHaveBeenCalledWith('feature-closed');
  });

  it('does not delete an active, default, or current branch', async () => {
    await expect(
      findOldestObsoletePreviewBranch(
        branches,
        'current-feature',
        async () => true,
      ),
    ).resolves.toBeUndefined();
  });
});
