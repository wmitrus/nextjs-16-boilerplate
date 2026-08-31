import { describe, expect, it, vi } from 'vitest';

import { assessContainmentFloorAncestry } from './git-ancestry';
import { containmentFloorSha } from './guards';

const candidateSha = 'a'.repeat(40);

describe('containment-floor ancestry', () => {
  it('proves a non-shallow candidate descends from the floor', () => {
    const executor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockReturnValueOnce('');
    expect(
      assessContainmentFloorAncestry(candidateSha, executor),
    ).toMatchObject({ status: 'PASS' });
    expect(executor.mock.calls).toEqual([
      ['git', ['rev-parse', '--is-shallow-repository'], expect.any(Object)],
      [
        'git',
        ['merge-base', '--is-ancestor', containmentFloorSha, candidateSha],
        expect.any(Object),
      ],
    ]);
  });

  it('blocks a shallow checkout without fetching history', () => {
    const executor = vi.fn().mockReturnValue('true\n');
    expect(
      assessContainmentFloorAncestry(candidateSha, executor),
    ).toMatchObject({ status: 'BLOCKED' });
    expect(executor).toHaveBeenCalledOnce();
  });

  it('blocks a candidate below the containment floor', () => {
    const nonAncestor = Object.assign(new Error('ignored'), { status: 1 });
    const executor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockImplementationOnce(() => {
        throw nonAncestor;
      });
    expect(
      assessContainmentFloorAncestry(candidateSha, executor),
    ).toMatchObject({ status: 'BLOCKED' });
  });

  it('returns bounded errors for Git failures and invalid shallow output', () => {
    expect(
      assessContainmentFloorAncestry(candidateSha, () => {
        throw new Error('raw stderr');
      }),
    ).toEqual({
      status: 'ERROR',
      reason: 'Could not determine whether local Git history is shallow.',
    });
    expect(
      assessContainmentFloorAncestry(
        candidateSha,
        vi.fn().mockReturnValue(Buffer.from('unknown\n')),
      ),
    ).toMatchObject({ status: 'ERROR' });
  });
});
