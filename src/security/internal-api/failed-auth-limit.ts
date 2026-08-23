import { resolveEdgeLogger } from '@/core/logger/di-edge';

import { redis } from '@/shared/lib/rate-limit/rate-limit';

/**
 * A dedicated counter for *rejected* internal-API credentials (SEC-44).
 *
 * Separate from the generic API limiter on purpose, and the pipeline order
 * stays as it is. `withInternalApiGuard` runs before `withRateLimit`
 * (`src/proxy.ts`), which is correct layering -- an unauthenticated caller
 * should be turned away by the guard, not by a limiter that would then have
 * spent a legitimate client's ordinary API allowance on someone else's
 * guessing. Reordering the pipeline to reuse that limiter would fix the
 * unmetered brute force by breaking both properties.
 *
 * ## Why this is not `checkStrictRateLimit`
 *
 * SEC-42's strict helper resolves the DI container and a TCP Postgres driver;
 * this guard runs in the **Edge** proxy, which can reach neither. Upstash is
 * REST over `fetch` and therefore the one durable store available here.
 *
 * ## Why an unavailable counter does not deny the request
 *
 * This is the deliberate asymmetry with SEC-42. There, failing closed cost
 * nothing because every strict endpoint already needed the database it could
 * not reach. Here the opposite holds: `/api/internal/health` and
 * `/api/internal/env-check` exist to be called *during* an incident, so
 * denying a **correct** key because the counter store is down would remove
 * the operator's diagnostic exactly when they need it.
 *
 * The key check itself is unaffected either way, so a counter outage weakens
 * brute-force protection rather than admitting anyone -- and with the entropy
 * floor `INTERNAL_API_KEY` now carries, an unmetered search is infeasible
 * regardless. This limiter is defence in depth, not the primary control.
 */

const REDIS_KEY_PREFIX = 'internal-api:failed:';

/** Rejections tolerated from one client before the guard stops answering. */
export const FAILED_ATTEMPT_LIMIT = 10;
/** Rolling window, refreshed on every rejection. */
export const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

let _logger:
  | ReturnType<ReturnType<typeof resolveEdgeLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger().child({
    type: 'Security',
    category: 'internal-api-guard',
    module: 'failed-auth-limit',
  });
  return _logger;
}

export interface FailedAuthState {
  readonly lockedOut: boolean;
  /** `true` when the durable counter could not be consulted. */
  readonly degraded: boolean;
}

/**
 * Reports whether this client has already exhausted its allowance, without
 * recording anything. Called before the key is checked, so a locked-out
 * caller is refused without another comparison being performed on their
 * behalf.
 */
export async function getFailedAuthState(
  clientKey: string,
): Promise<FailedAuthState> {
  if (!redis) return { lockedOut: false, degraded: true };

  try {
    const count = await redis.get<number>(`${REDIS_KEY_PREFIX}${clientKey}`);
    return { lockedOut: (count ?? 0) >= FAILED_ATTEMPT_LIMIT, degraded: false };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    getLogger().warn(
      {
        event: 'internal_api:failed_auth_read_failed',
        errorMessage: err.message,
        errorName: err.name,
        degraded: true,
      },
      'Internal-API failed-auth counter unreachable; brute-force protection is degraded for this request',
    );
    return { lockedOut: false, degraded: true };
  }
}

/** Records one rejection and extends the window. */
export async function recordFailedAuthAttempt(
  clientKey: string,
): Promise<void> {
  if (!redis) return;

  try {
    const key = `${REDIS_KEY_PREFIX}${clientKey}`;
    await redis.incr(key);
    // Refreshed on every rejection, so a client that keeps guessing stays
    // locked out rather than being released on a fixed schedule.
    await redis.pexpire(key, FAILED_ATTEMPT_WINDOW_MS);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    getLogger().warn(
      {
        event: 'internal_api:failed_auth_write_failed',
        errorMessage: err.message,
        errorName: err.name,
        degraded: true,
      },
      'Internal-API failed-auth counter write failed; this rejection was not counted',
    );
  }
}

/** Clears the counter after a successful authentication. */
export async function clearFailedAuthAttempts(
  clientKey: string,
): Promise<void> {
  if (!redis) return;

  try {
    await redis.del(`${REDIS_KEY_PREFIX}${clientKey}`);
  } catch {
    // A stale counter only costs this client its remaining allowance for the
    // rest of the window; it cannot admit anyone, so it is not worth failing
    // an otherwise successful request over.
  }
}
