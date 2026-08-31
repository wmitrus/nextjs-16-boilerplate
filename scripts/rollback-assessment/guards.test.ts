import { describe, expect, it } from 'vitest';

import {
  assertProductionDeployment,
  gitRefSchema,
  parseRollbackAssessmentArgs,
} from './guards';

const expected = {
  orgId: 'team_expected',
  owner: 'wmitrus',
  projectId: 'prj_expected',
  repository: 'nextjs-16-boilerplate',
};
const deploymentId = 'dpl_AaJaXYD7YrcsMX8j6UyBPJCBXvrn';

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: deploymentId,
    meta: {
      githubCommitOrg: expected.owner,
      githubCommitRef: 'main',
      githubCommitRepo: expected.repository,
      githubCommitSha: 'a'.repeat(40),
      githubDeployment: '1',
    },
    ownerId: expected.orgId,
    projectId: expected.projectId,
    readyState: 'READY',
    target: 'production',
    url: 'project-immutable-abc123-team.vercel.app',
    ...overrides,
  };
}

describe('rollback assessment candidate parsing', () => {
  const invalidArgumentCases: [string[]][] = [
    [[]],
    [['--deployment-id', deploymentId, `--deployment-id=${deploymentId}`]],
    [['--deployment-id=latest']],
    [['--deployment-id=first']],
    [['--latest']],
  ];
  it.each(invalidArgumentCases)(
    'rejects ambiguous or malformed nominations',
    (args) => {
      expect(() => parseRollbackAssessmentArgs(args)).toThrow();
    },
  );

  it('accepts one explicitly nominated deployment ID', () => {
    expect(
      parseRollbackAssessmentArgs([`--deployment-id=${deploymentId}`]),
    ).toEqual({ deploymentId, executeRemoteCandidateRead: false });
    expect(
      parseRollbackAssessmentArgs(['--', `--deployment-id=${deploymentId}`]),
    ).toEqual({ deploymentId, executeRemoteCandidateRead: false });
    expect(
      parseRollbackAssessmentArgs([
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
      ]),
    ).toEqual({ deploymentId, executeRemoteCandidateRead: true });
  });

  it('rejects a duplicate remote-read acknowledgement', () => {
    expect(() =>
      parseRollbackAssessmentArgs([
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
        '--execute-remote-candidate-read',
      ]),
    ).toThrow('may appear only once');
  });
});

describe('production deployment DETAIL guard', () => {
  it('accepts exact READY production DETAIL evidence', () => {
    expect(
      assertProductionDeployment(detail(), expected, deploymentId),
    ).toMatchObject({
      deploymentId,
      gitRef: 'main',
      gitSha: 'a'.repeat(40),
    });
  });

  it.each([
    ['non-READY', { readyState: 'BUILDING' }],
    ['null target', { target: null }],
    ['wrong organization', { ownerId: 'team_other' }],
    ['wrong project', { projectId: 'prj_other' }],
    [
      'wrong repository owner',
      { meta: { ...detail().meta, githubCommitOrg: 'other' } },
    ],
    [
      'wrong repository name',
      { meta: { ...detail().meta, githubCommitRepo: 'other' } },
    ],
    [
      'missing deployment marker',
      { meta: { ...detail().meta, githubDeployment: undefined } },
    ],
    [
      'malformed SHA',
      { meta: { ...detail().meta, githubCommitSha: 'not-a-sha' } },
    ],
    [
      'malformed ref',
      { meta: { ...detail().meta, githubCommitRef: 'main..bad' } },
    ],
    ['malformed immutable URL', { url: 'host.vercel.app/path' }],
  ])('rejects %s', (_reason, overrides) => {
    expect(() =>
      assertProductionDeployment(detail(overrides), expected, deploymentId),
    ).toThrow('production identity requirements');
  });

  it.each([
    ['NUL', 'main\u0000branch'],
    ['control character', 'main\u001fbranch'],
    ['DEL', 'main\u007fbranch'],
    ['whitespace', 'main branch'],
    ['tilde', 'main~branch'],
    ['caret', 'main^branch'],
    ['colon', 'main:branch'],
    ['question mark', 'main?branch'],
    ['asterisk', 'main*branch'],
    ['opening bracket', 'main[branch'],
    ['backslash', 'main\\branch'],
  ])('rejects a Git ref containing %s', (_reason, gitRef) => {
    expect(() =>
      assertProductionDeployment(
        detail({ meta: { ...detail().meta, githubCommitRef: gitRef } }),
        expected,
        deploymentId,
      ),
    ).toThrow('production identity requirements');
  });

  it.each([
    ['leading-dot component', '.hidden'],
    ['leading-dot non-first component', 'foo/.hidden'],
    ['reserved .lock suffix', 'foo.lock'],
    ['reserved .lock suffix on a component', 'foo/bar.lock'],
    ['bare @', '@'],
    ['leading dash', '-feature'],
  ])('rejects a Git ref that is %s', (_reason, gitRef) => {
    expect(gitRefSchema.safeParse(gitRef).success).toBe(false);
  });

  it.each(['main', 'release/2026-08', 'feature/ozi-78', 'feature/name]'])(
    'accepts a valid Git branch name %s',
    (gitRef) => {
      expect(gitRefSchema.safeParse(gitRef).success).toBe(true);
    },
  );

  it.each([
    ['NUL', 'host\u0000.vercel.app'],
    ['control character', 'host\u001f.vercel.app'],
    ['DEL', 'host\u007f.vercel.app'],
    ['whitespace', 'host name.vercel.app'],
    ['slash', 'host.vercel.app/path'],
    ['colon', 'host.vercel.app:443'],
    ['question mark', 'host.vercel.app?query=value'],
    ['hash', 'host.vercel.app#fragment'],
    ['at sign', 'user@host.vercel.app'],
  ])(
    'rejects an immutable deployment hostname containing %s',
    (_reason, url) => {
      expect(() =>
        assertProductionDeployment(detail({ url }), expected, deploymentId),
      ).toThrow('production identity requirements');
    },
  );
});
