import { env } from '@/core/env';
import { resolveEdgeLogger } from '@/core/logger/di-edge';

import { apiRateLimit, checkUpstashRateLimit } from './rate-limit';
import { localRateLimit } from './rate-limit-local';
import type { RateLimitResult } from './rate-limit-local';

export const UPSTASH_RATE_LIMIT_TIMEOUT_MS = 1500;

let _logger: ReturnType<typeof resolveEdgeLogger> | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger();
  return _logger;
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Rate limit provider timeout'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Parses the duration string (e.g., "60 s") into milliseconds.
 * Supports "s", "m", "h", "d".
 *
 * @param duration - Duration string from env
 * @returns milliseconds
 */
export function parseDurationToMs(duration: string): number {
  const [value, unit] = duration.trim().split(/\s+/);
  const numValue = parseInt(value!, 10);

  switch (unit?.toLowerCase()) {
    case 's':
    case 'sec':
    case 'second':
    case 'seconds':
      return numValue * 1000;
    case 'm':
    case 'min':
    case 'minute':
    case 'minutes':
      return numValue * 60 * 1000;
    case 'h':
    case 'hr':
    case 'hour':
    case 'hours':
      return numValue * 60 * 60 * 1000;
    case 'd':
    case 'day':
    case 'days':
      return numValue * 24 * 60 * 60 * 1000;
    default:
      return numValue * 1000;
  }
}

/**
 * How a rate-limit check behaves when the durable primary is unreachable.
 *
 * - `standard` (default): fall back to a process-local counter. On a
 *   serverless platform that counter is per-instance, so the limit becomes
 *   approximate -- an acceptable availability trade for ordinary API
 *   throttling.
 * - `strict`: try a durable secondary; if that is also unreachable, **fail
 *   closed**. For sign-in, password reset, verification and invitation paths
 *   an approximate limit is not a limit: an attacker who can reach several
 *   instances gets several independent allowances. See SEC-42.
 */
export type RateLimitMode = 'standard' | 'strict';

/**
 * The durable secondary, as this module needs to see it.
 *
 * Structurally typed rather than imported from
 * `@/modules/rate-limit/domain/DurableRateLimitStore` on purpose. This file
 * lives in `shared/` and is reachable from the Edge middleware; importing the
 * module's Drizzle-backed implementation -- even transitively through its
 * domain types -- would drag Node-only database code toward the Edge bundle
 * and put persistence knowledge in `shared/`, which this repository's
 * architecture rules forbid.
 *
 * The Node-side wiring lives in `@/security/api/strict-rate-limit`, which
 * resolves the real store from the container and passes it in here.
 */
export interface StrictRateLimitDeps {
  readonly durable: {
    increment(
      identifier: string,
      windowMs: number,
    ): Promise<{ count: number; windowEnd: Date }>;
  };
  /** Resolves the `strict_rate_limit_degrade` operational switch. */
  readonly isDegradeSwitchOn: () => Promise<boolean>;
}

export interface CheckRateLimitOptions {
  /**
   * Include `path` so the edge-log loop prevention in `edge-utils.ts` can
   * suppress forwarding this WARN back into the very endpoint being
   * rate-limited (e.g. /api/logs).
   */
  path?: string;
  /** Defaults to `standard`. */
  mode?: RateLimitMode;
  /** Per-endpoint override; defaults to `API_RATE_LIMIT_REQUESTS`. */
  limit?: number;
  /** Per-endpoint override; defaults to `API_RATE_LIMIT_WINDOW`. */
  windowMs?: number;
  /**
   * Required for `mode: 'strict'`. Absent, strict mode has no durable
   * secondary to consult and fails closed immediately -- see
   * `strictFallback`.
   */
  strict?: StrictRateLimitDeps;
}

/**
 * Result shape returned when strict mode fails closed. `remaining: 0` and a
 * reset one window out are what a caller already knows how to render, so a
 * fail-closed answer needs no special handling at the call site -- it just
 * refuses.
 */
function failClosed(limit: number, windowMs: number): RateLimitResult {
  return {
    success: false,
    limit,
    remaining: 0,
    reset: new Date(Date.now() + windowMs),
  };
}

/**
 * The strict-mode path taken once the primary store has not answered.
 *
 * Order is: durable secondary, then fail closed. The operational switch can
 * substitute the process-local counter for the fail-closed step, but only by
 * saying `true` -- see the loosen-only rule on `OperationalSwitch`.
 */
async function strictFallback(
  identifier: string,
  limit: number,
  windowMs: number,
  logContext: Record<string, unknown>,
  deps: StrictRateLimitDeps | undefined,
): Promise<RateLimitResult> {
  if (deps) {
    try {
      const hit = await deps.durable.increment(identifier, windowMs);
      getLogger().warn(
        // Deliberately not naming Postgres. This file is runtime-agnostic
        // and does not know which store was injected; `strict-rate-limit.ts`
        // is where that belongs.
        { ...logContext, secondary: 'durable', degraded: true },
        'Rate limit primary unavailable; strict mode served by the durable secondary',
      );
      return {
        success: hit.count <= limit,
        limit,
        remaining: Math.max(0, limit - hit.count),
        reset: hit.windowEnd,
      };
    } catch (error) {
      logContext = {
        ...logContext,
        secondaryErrorMessage:
          error instanceof Error ? error.message : String(error),
        secondaryErrorName:
          error instanceof Error ? error.name : 'UnknownError',
      };
    }
  }

  // Both stores are gone (or strict was requested without wiring one). The
  // operator can still choose the old behaviour, but nothing that merely
  // fails to answer may choose it for them.
  const degrade = deps ? await deps.isDegradeSwitchOn() : false;
  if (degrade) {
    getLogger().warn(
      { ...logContext, degraded: true, switchedOff: true },
      'Strict rate limiting DEGRADED by operational switch -- counter is process-local and not durable across instances',
    );
    return localRateLimit(identifier, limit, windowMs);
  }

  getLogger().error(
    { ...logContext, failClosed: true },
    'Strict rate limiting has no durable store available; failing closed',
  );
  return failClosed(limit, windowMs);
}

/**
 * Unified helper to check rate limits across different environments.
 * Automatically switches between Upstash (production) and In-memory (local).
 *
 * @param identifier - Unique identifier for the client (e.g., IP)
 * @param options - Logging context and mode. See `CheckRateLimitOptions`.
 * @returns RateLimitResult
 */
export async function checkRateLimit(
  identifier: string,
  options?: CheckRateLimitOptions,
): Promise<RateLimitResult> {
  const mode = options?.mode ?? 'standard';
  const windowMs =
    options?.windowMs ?? parseDurationToMs(env.API_RATE_LIMIT_WINDOW);
  const limit = options?.limit ?? env.API_RATE_LIMIT_REQUESTS;
  const path = options?.path;

  if (apiRateLimit) {
    try {
      return await withTimeout(
        checkUpstashRateLimit(identifier),
        UPSTASH_RATE_LIMIT_TIMEOUT_MS,
      );
    } catch (error) {
      const logContext = {
        provider: 'upstash',
        identifier,
        mode,
        timeoutMs: UPSTASH_RATE_LIMIT_TIMEOUT_MS,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        ...(path !== undefined ? { path } : {}),
      };

      if (mode === 'strict') {
        return strictFallback(
          identifier,
          limit,
          windowMs,
          logContext,
          options?.strict,
        );
      }

      getLogger().warn(
        logContext,
        'Rate limit provider unavailable, using local fallback',
      );
      return localRateLimit(identifier, limit, windowMs);
    }
  }

  // No Upstash configured at all. In strict mode that is a deployment
  // decision rather than an outage, so the durable secondary is still tried
  // -- a production deployment without Upstash must not silently downgrade
  // its security-critical limits to a per-instance Map.
  if (mode === 'strict') {
    return strictFallback(
      identifier,
      limit,
      windowMs,
      {
        provider: 'none',
        identifier,
        mode,
        ...(path !== undefined ? { path } : {}),
      },
      options?.strict,
    );
  }

  return localRateLimit(identifier, limit, windowMs);
}
