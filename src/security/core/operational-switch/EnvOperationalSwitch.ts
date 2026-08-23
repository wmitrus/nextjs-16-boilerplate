import type {
  OperationalSwitch,
  OperationalSwitchKey,
} from '@/core/contracts/operational-switch';

/**
 * The deploy-time base layer: reads each switch from a T3-Env value.
 *
 * This layer is always present and has no runtime dependency of its own --
 * no database, no Redis, no external provider. That is the point: whatever
 * else is unreachable, the base still resolves, so the layered switch always
 * has an answer to fall back to.
 *
 * Changing it requires a Vercel redeploy. That is acceptable for what it is:
 * the standing default, not the emergency lever. See SEC-42.
 */
export class EnvOperationalSwitch implements OperationalSwitch {
  /**
   * A `Map`, not a plain record indexed by `key`. The key is a literal union
   * so a dynamic lookup would in fact be safe here, but this repository's
   * SEC-15/SEC-20 patterns ask for `Map` or explicit dispatch over
   * `obj[dynamicKey]` regardless -- the reader of the next such lookup should
   * not have to re-derive whether the key is constrained.
   */
  private readonly values: ReadonlyMap<OperationalSwitchKey, boolean>;

  constructor(values: Readonly<Record<OperationalSwitchKey, boolean>>) {
    this.values = new Map(
      Object.entries(values) as Array<[OperationalSwitchKey, boolean]>,
    );
  }

  async isOn(key: OperationalSwitchKey): Promise<boolean> {
    // An unconfigured switch is off: a switch whose only job is to degrade a
    // security control must never default to degrading it.
    return this.values.get(key) ?? false;
  }
}
