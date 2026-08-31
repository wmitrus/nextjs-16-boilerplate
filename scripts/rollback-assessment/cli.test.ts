import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const remoteCandidateMocks = vi.hoisted(() => ({
  readExpectedProductionIdentity: vi.fn(),
  readRemoteCandidateDetail: vi.fn(),
}));

// Module-boundary mock: run() is structurally bound to the real
// './remote-candidate' functions with no caller-controlled dependency bag,
// so CLI-level tests control the remote outcome by mocking the module
// itself rather than injecting a fake executor.
vi.mock('./remote-candidate', () => remoteCandidateMocks);

import { buildLocalRollbackAssessment, run } from './cli';

function extractExportedSignature(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const returnTypeStart = source.indexOf('): ', start);
  const bodyStart = source.indexOf(' {', returnTypeStart);
  return source.slice(start, bodyStart);
}

const deploymentId = 'dpl_AaJaXYD7YrcsMX8j6UyBPJCBXvrn';
const expectedIdentity = {
  orgId: 'team_expected',
  owner: 'wmitrus',
  projectId: 'prj_expected',
  repository: 'nextjs-16-boilerplate',
};

function authoritativeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: deploymentId,
    meta: {
      githubCommitOrg: expectedIdentity.owner,
      githubCommitRef: 'main',
      githubCommitRepo: expectedIdentity.repository,
      githubCommitSha: 'a'.repeat(40),
      githubDeployment: '1',
    },
    ownerId: expectedIdentity.orgId,
    projectId: expectedIdentity.projectId,
    readyState: 'READY',
    target: 'production',
    url: 'project-immutable-abc123-team.vercel.app',
    ...overrides,
  };
}

beforeEach(() => {
  remoteCandidateMocks.readExpectedProductionIdentity.mockReset();
  remoteCandidateMocks.readRemoteCandidateDetail.mockReset();
});

describe('local rollback assessment CLI', () => {
  it('produces a bounded blocked plan without subprocesses or network access', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      run(['node', 'cli.ts', `--deployment-id=${deploymentId}`]);
      const output = JSON.parse(log.mock.calls[0]?.[0] as string);
      expect(output).toMatchObject({
        nominatedDeploymentId: deploymentId,
        candidateIdentity: { status: 'BLOCKED' },
        containmentFloorAncestry: { status: 'BLOCKED' },
        environmentContract: { status: 'BLOCKED' },
        schemaCompatibility: { status: 'BLOCKED' },
        smoke: { status: 'BLOCKED' },
        rollbackAction: 'NOT_AUTHORIZED',
        rollbackExecutable: false,
        remoteCandidateEvidence: { status: 'NOT_REQUESTED' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        remoteCandidateMocks.readExpectedProductionIdentity,
      ).not.toHaveBeenCalled();
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /token|secret|password/i,
      );
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('rejects a malformed remote nomination before invoking the remote-read module', () => {
    expect(() =>
      run([
        'node',
        'cli.ts',
        '--deployment-id=latest',
        '--execute-remote-candidate-read',
      ]),
    ).toThrow('deployment ID is malformed');
    expect(
      remoteCandidateMocks.readRemoteCandidateDetail,
    ).not.toHaveBeenCalled();
  });

  it('invokes the real remote-read module exactly once with the nominated ID, only after acknowledgement', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockReturnValue(
      authoritativeDetail(),
    );

    try {
      run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
      ]);
      const output = JSON.parse(log.mock.calls[0]?.[0] as string);
      expect(
        remoteCandidateMocks.readExpectedProductionIdentity,
      ).toHaveBeenCalledOnce();
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).toHaveBeenCalledOnce();
      expect(
        remoteCandidateMocks.readRemoteCandidateDetail,
      ).toHaveBeenCalledWith(deploymentId);
      expect(output).toMatchObject({
        candidateIdentity: { status: 'PASS' },
        environmentContract: { status: 'BLOCKED' },
        schemaCompatibility: { status: 'BLOCKED' },
        smoke: { status: 'BLOCKED' },
        remoteCandidateEvidence: {
          deploymentId,
          gitRef: 'main',
          gitSha: 'a'.repeat(40),
          status: 'READ_AND_VALIDATED',
        },
        rollbackAction: 'NOT_AUTHORIZED',
        rollbackExecutable: false,
      });
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    ['wrong organization', { ownerId: 'team_other' }],
    ['wrong project', { projectId: 'prj_other' }],
    [
      'wrong repository',
      {
        meta: {
          ...authoritativeDetail().meta,
          githubCommitRepo: 'other',
        },
      },
    ],
    ['Preview target', { target: 'preview' }],
    ['non-READY state', { readyState: 'BUILDING' }],
    ['different deployment ID', { id: 'dpl_OtherDeployment' }],
  ])('rejects remote DETAIL with %s', (_reason, overrides) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockReturnValue(
      authoritativeDetail(overrides),
    );
    try {
      run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
      ]);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        candidateIdentity: { status: 'INVALID' },
        containmentFloorAncestry: { status: 'BLOCKED' },
        remoteCandidateEvidence: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('returns bounded ERROR evidence when the remote-read module fails, without leaking its message', () => {
    const sentinel = 'sentinel-vercel-token stderr';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    remoteCandidateMocks.readExpectedProductionIdentity.mockReturnValue(
      expectedIdentity,
    );
    remoteCandidateMocks.readRemoteCandidateDetail.mockImplementation(() => {
      throw new Error(sentinel);
    });
    try {
      run([
        'node',
        'cli.ts',
        `--deployment-id=${deploymentId}`,
        '--execute-remote-candidate-read',
      ]);
      const output = JSON.stringify(log.mock.calls);
      expect(output).not.toContain(sentinel);
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        candidateIdentity: { status: 'BLOCKED' },
        remoteCandidateEvidence: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
    }
  });

  it('does not label locally supplied candidate DETAIL as remotely read, and never touches the remote-read module', () => {
    const assessment = buildLocalRollbackAssessment({
      candidateDetail: authoritativeDetail(),
      deploymentId,
      expectedIdentity,
    });
    expect(assessment.candidateIdentity).toMatchObject({ status: 'PASS' });
    expect(assessment.remoteCandidateEvidence).toEqual({
      status: 'NOT_REQUESTED',
    });
    expect(
      remoteCandidateMocks.readExpectedProductionIdentity,
    ).not.toHaveBeenCalled();
    expect(
      remoteCandidateMocks.readRemoteCandidateDetail,
    ).not.toHaveBeenCalled();
  });

  it('keeps locally supplied candidate + ancestry PASS as NOT_REQUESTED provenance', () => {
    const gitExecutor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockReturnValueOnce('');
    const assessment = buildLocalRollbackAssessment({
      candidateDetail: authoritativeDetail(),
      deploymentId,
      expectedIdentity,
      gitExecutor,
    });
    expect(assessment.containmentFloorAncestry).toMatchObject({
      status: 'PASS',
    });
    expect(assessment.remoteCandidateEvidence).toEqual({
      status: 'NOT_REQUESTED',
    });
  });

  it('never yields REMOTE_READ provenance merely by injecting candidateDetail into the pure builder', () => {
    const assessment = buildLocalRollbackAssessment({
      candidateDetail: authoritativeDetail(),
      deploymentId,
      expectedIdentity,
    });
    expect(assessment.remoteCandidateEvidence.status).not.toBe(
      'READ_AND_VALIDATED',
    );
  });

  it("rejects REMOTE_READ provenance at the exported builder's type, and ignores it at runtime", () => {
    const assessment = buildLocalRollbackAssessment(
      // @ts-expect-error — buildLocalRollbackAssessment's public signature
      // has no provenance parameter; this line exists so `pnpm typecheck`
      // fails the moment that invariant regresses.
      { candidateEvidenceSource: 'REMOTE_READ', deploymentId },
    );
    expect(assessment.remoteCandidateEvidence).toEqual({
      status: 'NOT_REQUESTED',
    });
  });

  it('confirms via source inspection that no exported API accepts REMOTE_READ provenance or a caller-controlled remote dependency bag', () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.resolve(dirname, 'cli.ts'), 'utf8');
    const buildSignature = extractExportedSignature(
      source,
      'buildLocalRollbackAssessment',
    );
    const runSignature = extractExportedSignature(source, 'run');
    const forbidden =
      /REMOTE_READ|candidateEvidenceSource|vercelExecutor|readExpectedIdentity/;
    expect(buildSignature).not.toMatch(forbidden);
    expect(runSignature).not.toMatch(forbidden);
    // run() must accept no second parameter at all.
    expect(runSignature).toBe('export function run(argv = process.argv): void');
    // The provenance discriminant must still exist somewhere internally —
    // otherwise the remote-read path could never establish it either.
    expect(source).toMatch(/REMOTE_READ/);
  });

  it('keeps environment and smoke blocked without deployment-bound evidence', () => {
    const assessment = buildLocalRollbackAssessment({ deploymentId });
    expect(assessment.environmentContract).toEqual({
      status: 'BLOCKED',
      reason: 'Deployment-bound environment evidence is required.',
    });
    expect(assessment.smoke).toMatchObject({ status: 'BLOCKED' });
  });

  it('rejects secret-shaped or raw environment evidence and never authorizes rollback', () => {
    const assessment = buildLocalRollbackAssessment({
      deploymentId,
      environmentContract: {
        authProvider: 'authjs',
        contractVersion: 'v1',
        fingerprint: 'a'.repeat(64),
        internalApiKey: 'not-accepted',
      },
    });
    expect(assessment.environmentContract).toMatchObject({ status: 'INVALID' });
    expect(assessment.rollbackExecutable).toBe(false);
    expect(assessment.rollbackAction).toBe('NOT_AUTHORIZED');
  });

  it.each([
    ['authjs', 'AuthJS read-only smoke is future-supported'],
    ['clerk', 'Clerk smoke is blocked'],
    ['unknown', 'unsupported or unknown provider'],
  ])('keeps %s smoke non-executing', (authProvider, reason) => {
    const assessment = buildLocalRollbackAssessment({
      deploymentId,
      environmentContract: {
        authProvider,
        contractVersion: 'v1',
        fingerprint: 'a'.repeat(64),
      },
    });
    expect(assessment.smoke).toMatchObject({ status: 'BLOCKED' });
    expect(assessment.smoke.reason).toContain(reason);
  });
});
