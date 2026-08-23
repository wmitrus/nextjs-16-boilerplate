import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import { OPERATIONAL_SWITCH_KEYS } from '@/core/contracts/operational-switch';

import { createOperationalSwitch } from './factory';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

function flagsReturning(value: boolean): FeatureFlagService {
  return { isEnabled: vi.fn(async () => value) };
}

describe('createOperationalSwitch', () => {
  beforeEach(() => {
    resetEnvMocks();
    vi.clearAllMocks();
  });

  it('uses the env base when the provider is static', async () => {
    // `static` flags come from FEATURE_FLAGS_STATIC -- itself an env var --
    // so layering it over the env base would add a moving part and no
    // capability. The flag service must not even be consulted.
    mockEnv.FEATURE_FLAG_PROVIDER = 'static';
    mockEnv.RATE_LIMIT_STRICT_DEGRADE = false;
    const flags = flagsReturning(true);

    const result = await createOperationalSwitch(flags).isOn(
      OPERATIONAL_SWITCH_KEYS.STRICT_RATE_LIMIT_DEGRADE,
    );

    expect(result).toBe(false);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('honours the env base under static', async () => {
    mockEnv.FEATURE_FLAG_PROVIDER = 'static';
    mockEnv.RATE_LIMIT_STRICT_DEGRADE = true;

    await expect(
      createOperationalSwitch(flagsReturning(false)).isOn(
        OPERATIONAL_SWITCH_KEYS.STRICT_RATE_LIMIT_DEGRADE,
      ),
    ).resolves.toBe(true);
  });

  it.each(['db', 'growthbook'] as const)(
    'layers the flag override over env when the provider is %s',
    async (provider) => {
      // Both read fresh on every call -- `DrizzleFeatureFlagService` issues a
      // SELECT per `isEnabled()` and the admin GUI writes that same table --
      // so both can be toggled without a redeploy.
      mockEnv.FEATURE_FLAG_PROVIDER = provider;
      mockEnv.RATE_LIMIT_STRICT_DEGRADE = false;
      const flags = flagsReturning(true);

      const result = await createOperationalSwitch(flags).isOn(
        OPERATIONAL_SWITCH_KEYS.STRICT_RATE_LIMIT_DEGRADE,
      );

      expect(result).toBe(true);
      expect(flags.isEnabled).toHaveBeenCalled();
    },
  );

  it('does not let a false flag tighten an env base that says degrade', async () => {
    // The loosen-only rule, asserted through the real factory: a flag store
    // that is merely unreachable answers `false`, and that must not be
    // mistaken for an operator decision.
    mockEnv.FEATURE_FLAG_PROVIDER = 'db';
    mockEnv.RATE_LIMIT_STRICT_DEGRADE = true;

    await expect(
      createOperationalSwitch(flagsReturning(false)).isOn(
        OPERATIONAL_SWITCH_KEYS.STRICT_RATE_LIMIT_DEGRADE,
      ),
    ).resolves.toBe(true);
  });

  it('stays enforcing when the flag service throws', async () => {
    mockEnv.FEATURE_FLAG_PROVIDER = 'db';
    mockEnv.RATE_LIMIT_STRICT_DEGRADE = false;
    const flags: FeatureFlagService = {
      isEnabled: vi.fn(async () => {
        throw new Error('flag store unreachable');
      }),
    };

    await expect(
      createOperationalSwitch(flags).isOn(
        OPERATIONAL_SWITCH_KEYS.STRICT_RATE_LIMIT_DEGRADE,
      ),
    ).resolves.toBe(false);
  });
});
