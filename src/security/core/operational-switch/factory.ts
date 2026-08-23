import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import type { OperationalSwitch } from '@/core/contracts/operational-switch';
import { env } from '@/core/env';

import { EnvOperationalSwitch } from './EnvOperationalSwitch';
import { FeatureFlagOperationalSwitch } from './FeatureFlagOperationalSwitch';
import { LayeredOperationalSwitch } from './LayeredOperationalSwitch';

/**
 * Feature-flag providers whose flags can actually be changed at runtime.
 *
 * `db` reads a fresh row on every `isEnabled()` call and the admin GUI writes
 * that same table, so a toggle takes effect on the next request -- the same
 * property GrowthBook has. `static` is excluded because its flags come from
 * `FEATURE_FLAGS_STATIC`, an environment variable: layering it over the env
 * base would add a moving part and no capability, since changing either one
 * needs the same redeploy.
 */
const RUNTIME_TOGGLABLE_PROVIDERS = new Set(['db', 'growthbook']);

/**
 * Builds the operational switch for this deployment (SEC-42).
 *
 * Always an env base; a feature-flag override on top only when the configured
 * provider can genuinely be toggled without a redeploy. The override is
 * loosen-only, so a deployment with no runtime provider is not less safe than
 * one with -- it simply has no fast lever.
 */
export function createOperationalSwitch(
  featureFlags: FeatureFlagService,
): OperationalSwitch {
  const base = new EnvOperationalSwitch({
    strict_rate_limit_degrade: env.RATE_LIMIT_STRICT_DEGRADE,
  });

  if (!RUNTIME_TOGGLABLE_PROVIDERS.has(env.FEATURE_FLAG_PROVIDER)) {
    return new LayeredOperationalSwitch(base);
  }

  return new LayeredOperationalSwitch(
    base,
    new FeatureFlagOperationalSwitch(featureFlags),
  );
}
