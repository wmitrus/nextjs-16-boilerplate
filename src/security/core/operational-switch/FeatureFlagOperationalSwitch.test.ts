import { describe, expect, it, vi } from 'vitest';

import type {
  FeatureFlagEvaluationContext,
  FeatureFlagService,
} from '@/core/contracts/feature-flags';

import { FeatureFlagOperationalSwitch } from './FeatureFlagOperationalSwitch';

function makeFlags(result: boolean | Error): FeatureFlagService {
  return {
    isEnabled: vi.fn().mockImplementation(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('FeatureFlagOperationalSwitch', () => {
  it('requests platform-global scope', async () => {
    const flags = makeFlags(true);
    const switcher = new FeatureFlagOperationalSwitch(flags);

    await switcher.isOn('strict_rate_limit_degrade');

    const [, context] = (flags.isEnabled as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, FeatureFlagEvaluationContext];
    expect(context.scope).toEqual({ kind: 'platform-global' });
  });

  it('supplies a stable, explicit system subject — never a synthetic tenant/org id', async () => {
    const flags = makeFlags(true);
    const switcher = new FeatureFlagOperationalSwitch(flags);

    await switcher.isOn('strict_rate_limit_degrade');
    const [, firstContext] = (flags.isEnabled as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, FeatureFlagEvaluationContext];

    await switcher.isOn('strict_rate_limit_degrade');
    const [, secondContext] = (flags.isEnabled as ReturnType<typeof vi.fn>).mock
      .calls[1] as [string, FeatureFlagEvaluationContext];

    expect(firstContext.subject.kind).toBe('system');
    expect(firstContext.subject).toEqual(secondContext.subject);
    // No synthetic tenant/organization identifier anywhere in the context —
    // the OZI-71 FF·D retirement of the '__platform__' AuthorizationContext.
    expect(JSON.stringify(firstContext)).not.toContain('__platform__');
    if (firstContext.subject.kind === 'system') {
      expect(firstContext.subject.systemSubjectId).toBeTruthy();
      expect(firstContext.subject.systemSubjectId).not.toBe('__platform__');
    }
  });

  it('passes the requested key through to isEnabled', async () => {
    const flags = makeFlags(true);
    const switcher = new FeatureFlagOperationalSwitch(flags);

    await switcher.isOn('strict_rate_limit_degrade');

    expect(flags.isEnabled).toHaveBeenCalledWith(
      'strict_rate_limit_degrade',
      expect.anything(),
    );
  });

  it('resolves true when the underlying service resolves true', async () => {
    const switcher = new FeatureFlagOperationalSwitch(makeFlags(true));
    expect(await switcher.isOn('strict_rate_limit_degrade')).toBe(true);
  });

  it('resolves false when the underlying service resolves false', async () => {
    const switcher = new FeatureFlagOperationalSwitch(makeFlags(false));
    expect(await switcher.isOn('strict_rate_limit_degrade')).toBe(false);
  });

  it('fails safe (false) when the underlying service throws', async () => {
    const switcher = new FeatureFlagOperationalSwitch(
      makeFlags(new Error('flag store unreachable')),
    );
    expect(await switcher.isOn('strict_rate_limit_degrade')).toBe(false);
  });
});
