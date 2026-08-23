import type {
  OperationalSwitch,
  OperationalSwitchKey,
} from '@/core/contracts/operational-switch';

/**
 * Composes a runtime override over a deploy-time base.
 *
 * The override is **loosen-only**: it takes effect only when it answers
 * `true`. Anything else -- an explicit `false`, an unreachable flag store, a
 * provider that never heard of the key -- falls through to the base.
 *
 * See `OperationalSwitch` for why this asymmetry is required rather than
 * merely tidy: the flag contract cannot distinguish "off" from "unavailable",
 * so a symmetric override would let a flag outage silently rewrite the
 * deployment's security posture in whichever direction happened to be
 * encoded as `false`.
 */
export class LayeredOperationalSwitch implements OperationalSwitch {
  constructor(
    private readonly base: OperationalSwitch,
    private readonly override?: OperationalSwitch,
  ) {}

  async isOn(key: OperationalSwitchKey): Promise<boolean> {
    if (this.override) {
      let overridden = false;
      try {
        overridden = await this.override.isOn(key);
      } catch {
        // Belt and braces. `FeatureFlagOperationalSwitch` already swallows
        // its own failures, but this composer must not depend on every
        // future override adapter remembering to -- an override that throws
        // has to degrade to "no override", never to an exception surfacing
        // inside the security control it was meant to make adjustable.
        overridden = false;
      }
      if (overridden) return true;
    }
    return this.base.isOn(key);
  }
}
