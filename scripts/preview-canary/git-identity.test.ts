import { describe, expect, it, vi } from 'vitest';

import { resolveLocalGitIdentity } from './git-identity';

const sha = 'a'.repeat(40);

describe('resolveLocalGitIdentity', () => {
  it('resolves trimmed branch and SHA with the exact Git commands', () => {
    const executor = vi
      .fn()
      .mockReturnValueOnce(' ozi-78 \n')
      .mockReturnValueOnce(` ${sha}\n`);

    expect(resolveLocalGitIdentity(executor)).toEqual({
      branch: 'ozi-78',
      sha,
    });
    expect(executor).toHaveBeenNthCalledWith(
      1,
      'git',
      ['branch', '--show-current'],
      expect.any(Object),
    );
    expect(executor).toHaveBeenNthCalledWith(
      2,
      'git',
      ['rev-parse', 'HEAD'],
      expect.any(Object),
    );
  });

  it('rejects an empty branch', () => {
    const executor = vi.fn().mockReturnValueOnce('\n').mockReturnValueOnce(sha);
    expect(() => resolveLocalGitIdentity(executor)).toThrow(
      'valid local Git identity',
    );
  });

  it('rejects a malformed SHA', () => {
    const executor = vi
      .fn()
      .mockReturnValueOnce('ozi-78')
      .mockReturnValueOnce('not-a-sha');
    expect(() => resolveLocalGitIdentity(executor)).toThrow(
      'valid local Git identity',
    );
  });

  it.each([
    ['branch', 0],
    ['SHA', 1],
  ])(
    'rejects a %s command failure with a bounded error',
    (_name, failureAt) => {
      const rawFailure = new Error('fatal: raw stderr must not be exposed');
      const executor = vi.fn().mockImplementation(() => {
        throw rawFailure;
      });
      if (failureAt === 1) {
        executor.mockReturnValueOnce('ozi-78');
      }

      let failure: unknown;
      try {
        resolveLocalGitIdentity(executor);
      } catch (error) {
        failure = error;
      }
      expect(failure).toEqual(
        new Error('Could not resolve local Git identity.'),
      );
      expect(String(failure)).not.toContain(rawFailure.message);
    },
  );
});
