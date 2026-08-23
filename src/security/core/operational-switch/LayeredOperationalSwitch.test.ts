import { describe, expect, it, vi } from 'vitest';

import type {
  OperationalSwitch,
  OperationalSwitchKey,
} from '@/core/contracts/operational-switch';

import { LayeredOperationalSwitch } from './LayeredOperationalSwitch';

const KEY: OperationalSwitchKey = 'strict_rate_limit_degrade';

function stub(result: boolean | Error): OperationalSwitch {
  return {
    isOn: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('LayeredOperationalSwitch', () => {
  it('uses the base when no override is configured', async () => {
    await expect(
      new LayeredOperationalSwitch(stub(true)).isOn(KEY),
    ).resolves.toBe(true);
    await expect(
      new LayeredOperationalSwitch(stub(false)).isOn(KEY),
    ).resolves.toBe(false);
  });

  it('lets a true override loosen a base that says enforce', async () => {
    const layered = new LayeredOperationalSwitch(stub(false), stub(true));
    await expect(layered.isOn(KEY)).resolves.toBe(true);
  });

  /**
   * The rule the whole design rests on. `FeatureFlagService.isEnabled()`
   * returns a plain boolean and `ResilientFeatureFlagService` answers `false`
   * when its delegate throws -- so "the operator set this to false" and "the
   * flag store is unreachable" are the same value at this seam.
   *
   * If the override were symmetric, every flag outage would silently rewrite
   * the deployment's posture. These three assert it is not.
   */
  it('does NOT let a false override tighten a base that says degrade', async () => {
    const layered = new LayeredOperationalSwitch(stub(true), stub(false));
    await expect(layered.isOn(KEY)).resolves.toBe(true);
  });

  it('falls through to the base when the override throws', async () => {
    const base = stub(false);
    const layered = new LayeredOperationalSwitch(
      base,
      stub(new Error('flag store unreachable')),
    );

    // Neither a crash inside the guarded control, nor an accidental `true`.
    await expect(layered.isOn(KEY)).resolves.toBe(false);
    expect(base.isOn).toHaveBeenCalledWith(KEY);
  });

  it('still honours a base that says degrade when the override throws', async () => {
    const layered = new LayeredOperationalSwitch(
      stub(true),
      stub(new Error('flag store unreachable')),
    );
    await expect(layered.isOn(KEY)).resolves.toBe(true);
  });

  it('never returns true purely because the override failed', async () => {
    // The adapter is responsible for not throwing (see
    // FeatureFlagOperationalSwitch), so the realistic failure shape reaching
    // this class is `false` -- which must not loosen anything.
    const layered = new LayeredOperationalSwitch(stub(false), stub(false));
    await expect(layered.isOn(KEY)).resolves.toBe(false);
  });

  it('does not consult the base when the override already said true', async () => {
    const base = stub(false);
    const layered = new LayeredOperationalSwitch(base, stub(true));

    await layered.isOn(KEY);

    expect(base.isOn).not.toHaveBeenCalled();
  });
});
