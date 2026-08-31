import { describe, expect, it } from 'vitest';

import {
  assertProductionDeployment,
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
  const invalidArgumentCases: Array<[string[]]> = [
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
    ).toEqual({ deploymentId });
    expect(
      parseRollbackAssessmentArgs(['--', `--deployment-id=${deploymentId}`]),
    ).toEqual({ deploymentId });
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
});
