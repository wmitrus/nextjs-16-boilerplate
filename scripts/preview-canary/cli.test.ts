import { describe, expect, it, vi } from 'vitest';

import { parseVercelProjectLink, runVercelOperation } from './cli';

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

  it.each([
    undefined,
    {},
    { orgId: 'team_expected' },
    { projectId: 'prj_expected' },
  ])('rejects a missing or malformed Vercel project link', (link) => {
    expect(() => parseVercelProjectLink(link)).toThrow('missing or malformed');
  });
});
