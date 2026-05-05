import { clerkClient } from '@clerk/nextjs/server';

import { resolveServerLogger } from '@/core/logger/di';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'invitations',
  module: 'clerk-invitation-bridge',
});

/**
 * Bridges DB invitations with Clerk's organization invitation API.
 *
 * When AUTH_PROVIDER=clerk, Clerk handles email delivery for invitations.
 * The DB invitation is the source of truth for token validation; Clerk's
 * invitation is supplementary (manages Clerk org membership on acceptance).
 *
 * This bridge is only called from DefaultInvitationService when
 * AUTH_PROVIDER=clerk. Non-Clerk providers use EmailService directly.
 */
export class ClerkInvitationBridge {
  async sendOrganizationInvitation(args: {
    clerkOrganizationId: string;
    email: string;
    role: 'org:admin' | 'org:member';
    redirectUrl: string;
  }): Promise<void> {
    const client = await clerkClient();

    try {
      await client.organizations.createOrganizationInvitation({
        organizationId: args.clerkOrganizationId,
        emailAddress: args.email,
        role: args.role,
        redirectUrl: args.redirectUrl,
      });

      logger.debug(
        {
          event: 'invitation:clerk:sent',
          email: args.email,
          clerkOrganizationId: args.clerkOrganizationId,
        },
        'Clerk organization invitation sent',
      );
    } catch (error) {
      logger.warn(
        {
          event: 'invitation:clerk:send_failed',
          email: args.email,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Clerk organization invitation send failed — DB invitation still created',
      );
    }
  }
}
