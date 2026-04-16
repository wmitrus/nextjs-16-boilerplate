import 'server-only';

import { env } from '@/core/env';

/**
 * Returns true when the Better Stack integration is active and the source
 * token is configured. Used to conditionally apply withBetterStack() in
 * next.config.ts and enable the pino transport in logger streams.
 */
export function isBetterStackEnabled(): boolean {
  return (
    Boolean(env.BETTERSTACK_ENABLED) && Boolean(env.BETTER_STACK_SOURCE_TOKEN)
  );
}

/**
 * Returns the Better Stack source token for server-side use (pino transport).
 * Returns null when not configured.
 */
export function getBetterStackSourceToken(): string | null {
  if (!isBetterStackEnabled()) return null;
  return env.BETTER_STACK_SOURCE_TOKEN ?? null;
}

/**
 * Returns the Better Stack ingesting URL override if set.
 * Falls back to the default Better Stack endpoint when not set.
 */
export function getBetterStackIngestingUrl(): string {
  return env.BETTER_STACK_INGESTING_URL;
}

/**
 * Returns true when Better Stack Web Vitals reporting is enabled.
 * Requires BETTERSTACK_ENABLED=true and BETTERSTACK_WEB_VITALS_ENABLED=true.
 */
export function isBetterStackWebVitalsEnabled(): boolean {
  return isBetterStackEnabled() && Boolean(env.BETTERSTACK_WEB_VITALS_ENABLED);
}
