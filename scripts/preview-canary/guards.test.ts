import { describe, expect, it } from 'vitest';

import {
  assertClerkTestKeys,
  assertExecute,
  assertExpectedNeonBranch,
  assertPreviewDeployment,
  parseCanaryArgs,
} from './guards';

const input = [
  '--preview-url=https://preview.example.vercel.app',
  '--git-branch=ozi-78',
  '--git-sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
];

describe('Preview canary fail-closed guards', () => {
  it('does not authorize mutation without --execute', () => {
    expect(() => assertExecute(parseCanaryArgs(input))).toThrow('--execute');
  });

  it.each([
    [
      {
        target: 'production',
        meta: {
          githubDeployment: '1',
          githubCommitOrg: 'wmitrus',
          githubCommitRef: 'ozi-78',
          githubCommitSha: 'a'.repeat(40),
          githubCommitRepo: 'nextjs-16-boilerplate',
        },
      },
      'production',
    ],
    [
      {
        target: 'preview',
        meta: {
          githubDeployment: '1',
          githubCommitOrg: 'wmitrus',
          githubCommitRef: 'other',
          githubCommitSha: 'a'.repeat(40),
          githubCommitRepo: 'nextjs-16-boilerplate',
        },
      },
      'branch',
    ],
    [
      {
        target: 'preview',
        meta: {
          githubDeployment: '1',
          githubCommitOrg: 'wmitrus',
          githubCommitRef: 'ozi-78',
          githubCommitSha: 'b'.repeat(40),
          githubCommitRepo: 'nextjs-16-boilerplate',
        },
      },
      'SHA',
    ],
    [
      {
        target: 'preview',
        meta: {
          githubDeployment: '1',
          githubCommitOrg: 'other',
          githubCommitRef: 'ozi-78',
          githubCommitSha: 'a'.repeat(40),
          githubCommitRepo: 'nextjs-16-boilerplate',
        },
      },
      'repository owner',
    ],
  ])('rejects a %s mismatch', (deployment) => {
    expect(() =>
      assertPreviewDeployment(deployment, {
        branch: 'ozi-78',
        owner: 'wmitrus',
        repository: 'nextjs-16-boilerplate',
        sha: 'a'.repeat(40),
      }),
    ).toThrow('Refusing deployment');
  });

  it('rejects the wrong Neon branch', () => {
    expect(() => assertExpectedNeonBranch(['preview/other'], 'ozi-78')).toThrow(
      'expected Neon Preview branch',
    );
  });

  it('rejects live Clerk keys', () => {
    expect(() =>
      assertClerkTestKeys('sk_live_example', 'pk_live_example'),
    ).toThrow('Clerk test keys');
  });
});
