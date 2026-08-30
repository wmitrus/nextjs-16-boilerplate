import { describe, expect, it } from 'vitest';

import {
  assertClerkTestKeys,
  assertExecute,
  assertExpectedNeonBranch,
  assertPreviewDeployment,
  assertVercelProjectLink,
  parseCanaryArgs,
} from './guards';

const input = [
  '--preview-url=https://preview.example.vercel.app',
  '--git-branch=ozi-78',
  '--git-sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
];

describe('Preview canary fail-closed guards', () => {
  const expectedDeployment = {
    target: 'preview',
    ownerId: 'team_expected',
    projectId: 'prj_expected',
    meta: {
      githubDeployment: '1',
      githubCommitOrg: 'wmitrus',
      githubCommitRef: 'ozi-78',
      githubCommitSha: 'a'.repeat(40),
      githubCommitRepo: 'nextjs-16-boilerplate',
    },
  };
  const expectedIdentity = {
    branch: 'ozi-78',
    orgId: 'team_expected',
    owner: 'wmitrus',
    projectId: 'prj_expected',
    repository: 'nextjs-16-boilerplate',
    sha: 'a'.repeat(40),
  };

  it('accepts the expected Vercel project and organization', () => {
    expect(() =>
      assertPreviewDeployment(expectedDeployment, expectedIdentity),
    ).not.toThrow();
  });

  it('does not authorize mutation without --execute', () => {
    expect(() => assertExecute(parseCanaryArgs(input))).toThrow('--execute');
  });

  it.each([
    [
      {
        target: 'production',
        ownerId: 'team_expected',
        projectId: 'prj_expected',
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
        ownerId: 'team_expected',
        projectId: 'prj_expected',
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
        ownerId: 'team_expected',
        projectId: 'prj_expected',
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
        ownerId: 'team_expected',
        projectId: 'prj_expected',
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
    [
      {
        target: 'preview',
        ownerId: 'team_expected',
        projectId: 'prj_other',
        meta: {
          githubDeployment: '1',
          githubCommitOrg: 'wmitrus',
          githubCommitRef: 'ozi-78',
          githubCommitSha: 'a'.repeat(40),
          githubCommitRepo: 'nextjs-16-boilerplate',
        },
      },
      'deployment project',
    ],
    [
      {
        target: 'preview',
        ownerId: 'team_other',
        projectId: 'prj_expected',
        meta: {
          githubDeployment: '1',
          githubCommitOrg: 'wmitrus',
          githubCommitRef: 'ozi-78',
          githubCommitSha: 'a'.repeat(40),
          githubCommitRepo: 'nextjs-16-boilerplate',
        },
      },
      'deployment organization',
    ],
  ])('rejects a %s mismatch', (deployment) => {
    expect(() => assertPreviewDeployment(deployment, expectedIdentity)).toThrow(
      'Refusing deployment',
    );
  });

  it('rejects a stale Vercel project link', () => {
    expect(() =>
      assertVercelProjectLink(
        { orgId: 'team_expected', projectId: 'prj_stale' },
        { orgId: 'team_expected', projectId: 'prj_expected' },
      ),
    ).toThrow('Vercel project link');
  });

  it.each([
    'https://user:password@preview.example.vercel.app',
    'https://preview.example.vercel.app?token=secret',
    'https://preview.example.vercel.app#fragment',
  ])('rejects an unsafe Preview URL: %s', (previewUrl) => {
    expect(() =>
      parseCanaryArgs([
        ...input.slice(0, 0),
        `--preview-url=${previewUrl}`,
        ...input.slice(1),
      ]),
    ).toThrow('Preview URL');
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
