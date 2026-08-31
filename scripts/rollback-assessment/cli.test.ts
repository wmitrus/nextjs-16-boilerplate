import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

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
  return JSON.stringify({
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
  });
}

function setVercelToken(): void {
  vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');
}

describe('local rollback assessment CLI', () => {
  it('produces a bounded blocked plan without subprocesses or network access', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    const vercelExecutor = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      run(['node', 'cli.ts', `--deployment-id=${deploymentId}`], {
        vercelExecutor,
      });
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
      expect(vercelExecutor).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /token|secret|password/i,
      );
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('rejects a malformed remote nomination before invoking Vercel', () => {
    const vercelExecutor = vi.fn();
    expect(() =>
      run(
        [
          'node',
          'cli.ts',
          '--deployment-id=latest',
          '--execute-remote-candidate-read',
        ],
        { vercelExecutor },
      ),
    ).toThrow('deployment ID is malformed');
    expect(vercelExecutor).not.toHaveBeenCalled();
  });

  it('performs exactly one exact DETAIL GET only after remote-read acknowledgement', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const vercelExecutor = vi.fn().mockReturnValue(authoritativeDetail());
    const gitExecutor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockReturnValueOnce('');

    try {
      setVercelToken();
      run(
        [
          'node',
          'cli.ts',
          `--deployment-id=${deploymentId}`,
          '--execute-remote-candidate-read',
        ],
        {
          gitExecutor,
          readExpectedIdentity: () => expectedIdentity,
          vercelExecutor,
        },
      );
      const output = JSON.parse(log.mock.calls[0]?.[0] as string);
      expect(vercelExecutor).toHaveBeenCalledOnce();
      const args = vercelExecutor.mock.calls[0]?.[1] as string[];
      expect(args).toEqual([
        'api',
        `/v13/deployments/${deploymentId}`,
        '--method=GET',
        '--raw',
        expect.stringMatching(/^--token=/),
      ]);
      expect(args.join(' ')).not.toMatch(/\/v(?:6|13)\/deployments\?/);
      expect(args).not.toContain('POST');
      expect(args).not.toContain('PATCH');
      expect(args).not.toContain('PUT');
      expect(args).not.toContain('DELETE');
      expect(output).toMatchObject({
        candidateIdentity: { status: 'PASS' },
        containmentFloorAncestry: { status: 'PASS' },
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
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ['wrong organization', { ownerId: 'team_other' }],
    ['wrong project', { projectId: 'prj_other' }],
    [
      'wrong repository',
      {
        meta: {
          ...JSON.parse(authoritativeDetail()).meta,
          githubCommitRepo: 'other',
        },
      },
    ],
    ['Preview target', { target: 'preview' }],
    ['non-READY state', { readyState: 'BUILDING' }],
    ['different deployment ID', { id: 'dpl_OtherDeployment' }],
  ])('rejects remote DETAIL with %s', (_reason, overrides) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      setVercelToken();
      run(
        [
          'node',
          'cli.ts',
          `--deployment-id=${deploymentId}`,
          '--execute-remote-candidate-read',
        ],
        {
          readExpectedIdentity: () => expectedIdentity,
          vercelExecutor: vi
            .fn()
            .mockReturnValue(authoritativeDetail(overrides)),
        },
      );
      expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
        candidateIdentity: { status: 'INVALID' },
        containmentFloorAncestry: { status: 'BLOCKED' },
        remoteCandidateEvidence: { status: 'ERROR' },
      });
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ['malformed JSON', vi.fn().mockReturnValue('{')],
    [
      'subprocess failure',
      vi.fn(() => {
        throw new Error('sentinel-vercel-token stderr');
      }),
    ],
  ])(
    'returns bounded remote evidence for %s without leaking provider output',
    (_reason, vercelExecutor) => {
      const sentinel = 'sentinel-vercel-token';
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        setVercelToken();
        run(
          [
            'node',
            'cli.ts',
            `--deployment-id=${deploymentId}`,
            '--execute-remote-candidate-read',
          ],
          {
            readExpectedIdentity: () => expectedIdentity,
            vercelExecutor,
          },
        );
        const output = JSON.stringify(log.mock.calls);
        expect(output).not.toContain(sentinel);
        expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
          candidateIdentity: { status: 'BLOCKED' },
          remoteCandidateEvidence: { status: 'ERROR' },
        });
      } finally {
        log.mockRestore();
        vi.unstubAllEnvs();
      }
    },
  );

  it('does not label locally supplied candidate DETAIL as remotely read', () => {
    const assessment = buildLocalRollbackAssessment({
      candidateDetail: JSON.parse(authoritativeDetail()) as Record<
        string,
        unknown
      >,
      deploymentId,
      expectedIdentity,
    });
    expect(assessment.candidateIdentity).toMatchObject({ status: 'PASS' });
    expect(assessment.remoteCandidateEvidence).toEqual({
      status: 'NOT_REQUESTED',
    });
  });

  it('keeps locally supplied candidate + ancestry PASS as NOT_REQUESTED provenance', () => {
    const gitExecutor = vi
      .fn()
      .mockReturnValueOnce('false\n')
      .mockReturnValueOnce('');
    const assessment = buildLocalRollbackAssessment({
      candidateDetail: JSON.parse(authoritativeDetail()) as Record<
        string,
        unknown
      >,
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
      candidateDetail: JSON.parse(authoritativeDetail()) as Record<
        string,
        unknown
      >,
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

  it('confirms via source inspection that no exported API accepts REMOTE_READ provenance', () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.resolve(dirname, 'cli.ts'), 'utf8');
    const buildSignature = extractExportedSignature(
      source,
      'buildLocalRollbackAssessment',
    );
    const runSignature = extractExportedSignature(source, 'run');
    expect(buildSignature).not.toMatch(/REMOTE_READ|candidateEvidenceSource/);
    expect(runSignature).not.toMatch(/REMOTE_READ|candidateEvidenceSource/);
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
