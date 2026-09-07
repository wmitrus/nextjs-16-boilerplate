import type { FeatureFlagEvaluationContext } from '@/core/contracts/feature-flags';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import type {
  OperationalSwitch,
  OperationalSwitchKey,
} from '@/core/contracts/operational-switch';

/**
 * OZI-71 FF·D — the operational switch's stable system-subject identity.
 * Not a tenant, not an organization, not a user: a fixed, explicit label for
 * "the deployment itself is asking," carried in `subject` only (what a
 * targeting provider hashes on). It has no bearing on `scope` -- the switch
 * always requests `platform-global` scope below, resolving only genuinely
 * `intentional_global` rows.
 */
const OPERATIONAL_SWITCH_SYSTEM_SUBJECT_ID = 'feature-flag-operational-switch';

/**
 * The runtime override layer: reads the switch from the repository's own
 * feature-flag service, so an operator can flip it without a redeploy.
 *
 * Only wired when `FEATURE_FLAG_PROVIDER` is a genuinely runtime-backed
 * provider (`db` or `growthbook`). Under `static` the flags themselves come
 * from `FEATURE_FLAGS_STATIC`, an env var -- layering that over another env
 * var would add a moving part and no capability.
 *
 * Returns `false` rather than throwing on any failure; the layered switch
 * treats anything that is not `true` as "no override", so a flag outage
 * falls through to the env base. See the loosen-only rule on
 * `OperationalSwitch`.
 */
export class FeatureFlagOperationalSwitch implements OperationalSwitch {
  constructor(private readonly flags: FeatureFlagService) {}

  async isOn(key: OperationalSwitchKey): Promise<boolean> {
    try {
      const context: FeatureFlagEvaluationContext = {
        scope: { kind: 'platform-global' },
        subject: {
          kind: 'system',
          systemSubjectId: OPERATIONAL_SWITCH_SYSTEM_SUBJECT_ID,
        },
      };
      return await this.flags.isEnabled(key, context);
    } catch {
      // `ResilientFeatureFlagService` already swallows delegate failures, but
      // this adapter must not depend on being wrapped in it.
      return false;
    }
  }
}
