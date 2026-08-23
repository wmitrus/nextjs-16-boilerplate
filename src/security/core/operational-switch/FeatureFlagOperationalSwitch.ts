import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import type {
  OperationalSwitch,
  OperationalSwitchKey,
} from '@/core/contracts/operational-switch';

/**
 * A synthetic platform-level context for the tenant-scoped flag contract.
 *
 * `FeatureFlagService.isEnabled()` requires an `AuthorizationContext`, but an
 * operational switch has no tenant and no subject -- it is a property of the
 * deployment, and the controls it guards run before authentication. The
 * mapping lives here, in the adapter, rather than at each call site.
 *
 * `DrizzleFeatureFlagService` resolves a row with `tenant_id IS NULL` when no
 * tenant-specific row matches, so a **global** flag row is what this reads --
 * which is the correct scope for a platform switch. A tenant-scoped row for
 * one of these keys would be meaningless; nothing creates one, and the
 * synthetic tenant id below is not a real tenant, so none can match.
 */
const PLATFORM_CONTEXT: AuthorizationContext = {
  tenant: { tenantId: '__platform__' },
  subject: { id: '__platform__' },
  resource: { type: 'feature' },
  action: 'feature:read',
};

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
      return await this.flags.isEnabled(key, PLATFORM_CONTEXT);
    } catch {
      // `ResilientFeatureFlagService` already swallows delegate failures, but
      // this adapter must not depend on being wrapped in it.
      return false;
    }
  }
}
