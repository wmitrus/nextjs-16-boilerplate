import { describe, expect, it, vi } from 'vitest';

import {
  readExpectedProductionIdentity,
  readRemoteCandidateDetail,
} from './remote-candidate';

const deploymentId = 'dpl_AaJaXYD7YrcsMX8j6UyBPJCBXvrn';

function setRequiredEnvironment(): void {
  vi.stubEnv('GITHUB_REPOSITORY', 'wmitrus/nextjs-16-boilerplate');
  vi.stubEnv('VERCEL_ORG_ID', 'team_expected');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_expected');
  vi.stubEnv('VERCEL_TOKEN', 'sentinel-vercel-token');
}

describe('remote rollback candidate evidence', () => {
  it('derives expected identity from local anchors and verifies the project link', () => {
    setRequiredEnvironment();
    try {
      expect(
        readExpectedProductionIdentity(() => ({
          orgId: 'team_expected',
          projectId: 'prj_expected',
        })),
      ).toEqual({
        orgId: 'team_expected',
        owner: 'wmitrus',
        projectId: 'prj_expected',
        repository: 'nextjs-16-boilerplate',
      });
      expect(() =>
        readExpectedProductionIdentity(() => ({
          orgId: 'team_other',
          projectId: 'prj_expected',
        })),
      ).toThrow('does not match');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('uses one bounded GET request for the exact validated deployment ID', () => {
    setRequiredEnvironment();
    const executor = vi
      .fn()
      .mockReturnValue(JSON.stringify({ id: deploymentId }));
    try {
      expect(readRemoteCandidateDetail(deploymentId, executor)).toEqual({
        id: deploymentId,
      });
      expect(executor).toHaveBeenCalledOnce();
      expect(executor.mock.calls[0]?.[1]).toEqual([
        'api',
        `/v13/deployments/${deploymentId}`,
        '--method=GET',
        '--raw',
        '--token=sentinel-vercel-token',
      ]);
      expect(executor.mock.calls[0]?.[2]).toMatchObject({
        maxBuffer: 128 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ['malformed JSON', '{'],
    ['non-object JSON', '[]'],
    ['oversized output', 'x'.repeat(128 * 1024 + 1)],
  ])('rejects %s without exposing provider content', (_reason, output) => {
    setRequiredEnvironment();
    try {
      expect(() =>
        readRemoteCandidateDetail(
          deploymentId,
          vi.fn().mockReturnValue(output),
        ),
      ).toThrow(/malformed data|too large/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('bounds the DETAIL request with a single timeout and no leakage on timeout', () => {
    setRequiredEnvironment();
    const timeoutError = Object.assign(new Error('sentinel-vercel-token'), {
      code: 'ETIMEDOUT',
      killed: true,
      signal: 'SIGTERM',
    });
    const executor = vi.fn().mockImplementation(() => {
      throw timeoutError;
    });
    try {
      expect(() => readRemoteCandidateDetail(deploymentId, executor)).toThrow(
        'Remote candidate DETAIL request failed.',
      );
      expect(executor).toHaveBeenCalledOnce();
      expect(executor.mock.calls[0]?.[2]).toMatchObject({
        timeout: 15_000,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects malformed IDs before invoking Vercel', () => {
    const executor = vi.fn();
    expect(() => readRemoteCandidateDetail('latest', executor)).toThrow(
      'deployment ID is malformed',
    );
    expect(executor).not.toHaveBeenCalled();
  });
});
