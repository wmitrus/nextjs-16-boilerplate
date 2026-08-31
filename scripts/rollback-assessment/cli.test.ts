import { describe, expect, it, vi } from 'vitest';

import { buildLocalRollbackAssessment, run } from './cli';

const deploymentId = 'dpl_AaJaXYD7YrcsMX8j6UyBPJCBXvrn';

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
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /token|secret|password/i,
      );
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
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
