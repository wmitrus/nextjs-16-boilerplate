import { describe, expect, it, vi } from 'vitest';

import {
  parseRuntimeDatabaseHost,
  readBoundedResponseBody,
  parseImmutableDeploymentUrl,
  parseVercelProjectLink,
  runVercelOperation,
} from './cli';

describe('Preview canary Vercel boundary', () => {
  it('reports a missing Vercel token before spawning Vercel', () => {
    vi.stubEnv('VERCEL_TOKEN', '');
    const executor = vi.fn();

    try {
      expect(() =>
        runVercelOperation(
          'inspect',
          ['inspect', 'https://preview.example'],
          executor,
        ),
      ).toThrow('VERCEL_TOKEN is required.');
      expect(executor).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('sanitizes a Vercel process failure without exposing the token', () => {
    const sentinel = 'sentinel-vercel-token';
    vi.stubEnv('VERCEL_TOKEN', sentinel);

    let failure: unknown;
    try {
      runVercelOperation(
        'inspect',
        ['inspect', 'https://preview.example'],
        () => {
          throw new Error(`failed --token=${sentinel}`);
        },
      );
    } catch (error) {
      failure = error;
    } finally {
      vi.unstubAllEnvs();
    }

    expect(failure).toEqual(new Error('Vercel inspect failed.'));
    expect(JSON.stringify(failure)).not.toContain(sentinel);
    expect(String(failure)).not.toContain(sentinel);
  });

  it('reports a Vercel child-process exit code without its output', () => {
    vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');

    try {
      expect(() =>
        runVercelOperation(
          'inspect',
          ['inspect', 'https://preview.example'],
          () => {
            const error = new Error(
              'sensitive child-process output',
            ) as Error & {
              status: number;
            };
            error.status = 2;
            throw error;
          },
        ),
      ).toThrow('Vercel inspect failed (exit code 2).');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('accepts only a complete Vercel project link', () => {
    expect(
      parseVercelProjectLink({
        orgId: 'team_expected',
        projectId: 'prj_expected',
      }),
    ).toEqual({ orgId: 'team_expected', projectId: 'prj_expected' });
  });

  it('accepts only a bounded runtime database hostname', () => {
    expect(
      parseRuntimeDatabaseHost(
        '{"databaseHost":"ep-test.us-east-2.aws.neon.tech"}',
      ),
    ).toBe('ep-test.us-east-2.aws.neon.tech');
  });

  it('derives the immutable runtime target from deployment metadata', () => {
    expect(
      parseImmutableDeploymentUrl({
        url: 'project-immutable-abc123-team.vercel.app',
      }),
    ).toBe('https://project-immutable-abc123-team.vercel.app');
  });

  it.each([
    undefined,
    'user@host.vercel.app',
    'host.vercel.app/path',
    'host.vercel.app?query',
    'host.vercel.app#hash',
    'host vercel.app',
  ])('rejects malformed immutable deployment URLs', (url) => {
    expect(() => parseImmutableDeploymentUrl({ url })).toThrow('immutable URL');
  });

  it.each([
    'not json',
    '{}',
    '{"databaseHost":"https://example.test"}',
    '{"databaseHost":"host/path"}',
  ])('rejects malformed runtime evidence: %s', (output) => {
    expect(() => parseRuntimeDatabaseHost(output)).toThrow('invalid evidence');
  });

  it.each([4096, 4097])(
    'enforces the byte response cap at %i bytes',
    async (size) => {
      const response = new Response('a'.repeat(size));
      if (size === 4096)
        await expect(readBoundedResponseBody(response)).resolves.toHaveLength(
          size,
        );
      else
        await expect(readBoundedResponseBody(response)).rejects.toThrow(
          'invalid evidence',
        );
    },
  );

  it('counts multibyte data by bytes and rejects a null body', async () => {
    await expect(
      readBoundedResponseBody(new Response('€'.repeat(1366))),
    ).rejects.toThrow('invalid evidence');
    await expect(readBoundedResponseBody(new Response(null))).rejects.toThrow(
      'invalid evidence',
    );
  });

  it.each([
    undefined,
    {},
    { orgId: 'team_expected' },
    { projectId: 'prj_expected' },
  ])('rejects a missing or malformed Vercel project link', (link) => {
    expect(() => parseVercelProjectLink(link)).toThrow('missing or malformed');
  });
});
