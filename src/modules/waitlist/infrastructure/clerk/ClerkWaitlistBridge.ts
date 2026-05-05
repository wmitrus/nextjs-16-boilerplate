import { createHash } from 'node:crypto';

import { resolveServerLogger } from '@/core/logger/di';

function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

const logger = resolveServerLogger().child({
  module: 'ClerkWaitlistBridge',
  type: 'AUTH',
  category: 'waitlist',
});

/**
 * ClerkWaitlistBridge — no-op bridge for Clerk integration.
 *
 * When AUTH_PROVIDER=clerk and REGISTRATION_MODE=invite-only, the waitlist
 * is managed via Clerk's built-in Waitlist UI component on the /waitlist page.
 * Clerk does not expose a server-side API for programmatically creating
 * waitlist entries — it is a UI-only flow handled by the Clerk dashboard.
 *
 * This bridge exists as a hook point for future Clerk API additions and
 * provides a consistent interface with other provider bridges.
 */
export class ClerkWaitlistBridge {
  async addToWaitlist(email: string): Promise<void> {
    logger.debug(
      { emailHash: hashEmail(email) },
      '[ClerkWaitlistBridge] Clerk waitlist is managed via UI component — no server-side API call needed',
    );
  }
}
