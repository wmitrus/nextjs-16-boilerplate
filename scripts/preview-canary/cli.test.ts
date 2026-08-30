import { describe, expect, it, vi } from 'vitest';

import { parseVercelProjectLink, runVercelOperation } from './cli';

describe('Preview canary Vercel boundary', () => {
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
