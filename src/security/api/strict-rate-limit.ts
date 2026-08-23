import { INFRASTRUCTURE, SECURITY } from '@/core/contracts';
import type { OperationalSwitch } from '@/core/contracts/operational-switch';
import { OPERATIONAL_SWITCH_KEYS } from '@/core/contracts/operational-switch';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  checkRateLimit,
  type CheckRateLimitOptions,
} from '@/shared/lib/rate-limit/rate-limit-helper';
import type { RateLimitResult } from '@/shared/lib/rate-limit/rate-limit-local';

import { DrizzleRateLimitStore } from '@/modules/rate-limit/infrastructure/drizzle/DrizzleRateLimitStore';

/**
 * Node-side entry point for security-critical rate limiting (SEC-42).
 *
 * This is the only place that knows both halves: that the durable secondary
 * is Postgres, and that the degrade switch comes from the DI container. The
 * helper in `shared/lib` stays runtime-agnostic and Edge-safe because this
 * file -- never that one -- imports the Drizzle store.
 *
 * **Node route handlers only.** The Edge middleware in `src/proxy.ts` cannot
 * reach Postgres with this repository's TCP driver, so it keeps using
 * standard mode for its generic per-IP window. Raising the Edge path is
 * tracked separately.
 */
export async function checkStrictRateLimit(
  identifier: string,
  options?: Omit<CheckRateLimitOptions, 'mode' | 'strict'>,
): Promise<RateLimitResult> {
  const container = getAppContainer();
  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const store = new DrizzleRateLimitStore(db);

  return checkRateLimit(identifier, {
    ...options,
    mode: 'strict',
    strict: {
      durable: {
        async increment(id, windowMs) {
          const hit = await store.increment(id, windowMs);
          // Opportunistic, identifier-scoped cleanup. Deliberately after the
          // increment and deliberately not awaited into the result: a purge
          // failure must never turn a successful rate-limit decision into a
          // failed one.
          void store.purgeExpired(id).catch(() => undefined);
          return { count: hit.count, windowEnd: hit.windowEnd };
        },
      },
      isDegradeSwitchOn: async () => {
        try {
          const operationalSwitch = container.resolve<OperationalSwitch>(
            SECURITY.OPERATIONAL_SWITCH,
          );
          return await operationalSwitch.isOn(
            OPERATIONAL_SWITCH_KEYS.STRICT_RATE_LIMIT_DEGRADE,
          );
        } catch {
          // An unresolvable switch is not permission to degrade.
          return false;
        }
      },
    },
  });
}
