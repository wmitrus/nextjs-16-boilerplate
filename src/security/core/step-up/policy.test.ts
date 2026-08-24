import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  APP_SECURITY_MASTER_KEY: undefined as string | undefined,
  ADMIN_STEP_UP_MODE: 'required' as 'required' | 'bypass-local-only',
  NODE_ENV: 'test' as string,
  VERCEL_ENV: undefined as string | undefined,
};

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...actual,
    get env() {
      return { ...actual.env, ...envMock };
    },
  };
});

import { resolveStepUpEnforcement } from './policy';

beforeEach(() => {
  envMock.APP_SECURITY_MASTER_KEY = 'policy-test-master-key-not-a-real-secret';
  envMock.ADMIN_STEP_UP_MODE = 'required';
  envMock.NODE_ENV = 'test';
  envMock.VERCEL_ENV = undefined;
});

describe('resolveStepUpEnforcement', () => {
  it('requires step-up by default', () => {
    expect(resolveStepUpEnforcement()).toEqual({ mode: 'required' });
  });

  it('honours the bypass only on a non-deployed environment', () => {
    envMock.ADMIN_STEP_UP_MODE = 'bypass-local-only';

    expect(resolveStepUpEnforcement()).toEqual({
      mode: 'bypassed',
      reason: 'local-only-bypass',
    });
  });

  it.each([
    ['production build', 'production', undefined],
    ['vercel production', 'test', 'production'],
    ['vercel preview', 'test', 'preview'],
  ])(
    'refuses the bypass on a deployed environment (%s)',
    (_label, nodeEnv, vercelEnv) => {
      // The env schema already rejects this configuration at startup. This
      // runtime check is the second half deliberately: a bypass that depends
      // on exactly one check being right is one mistake from production.
      envMock.ADMIN_STEP_UP_MODE = 'bypass-local-only';
      envMock.NODE_ENV = nodeEnv;
      envMock.VERCEL_ENV = vercelEnv;

      expect(resolveStepUpEnforcement()).toEqual({ mode: 'required' });
    },
  );

  it('treats missing key material as unavailable, never as permitted', () => {
    envMock.APP_SECURITY_MASTER_KEY = undefined;

    expect(resolveStepUpEnforcement()).toEqual({
      mode: 'unavailable',
      reason: 'missing_key_material',
    });
  });

  it('lets a local bypass work without key material', () => {
    // A developer running with the bypass has no reason to configure a
    // master key, and demanding one would push people towards committing a
    // fixture value.
    envMock.APP_SECURITY_MASTER_KEY = undefined;
    envMock.ADMIN_STEP_UP_MODE = 'bypass-local-only';

    expect(resolveStepUpEnforcement()).toEqual({
      mode: 'bypassed',
      reason: 'local-only-bypass',
    });
  });
});
