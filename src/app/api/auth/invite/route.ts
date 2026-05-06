import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createSuccessResponse,
  createServerErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { ClerkInvitationBridge } from '@/modules/invitations/infrastructure/clerk/ClerkInvitationBridge';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const bodySchema = z.object({
  email: z.email(),
  roleId: z.uuid(),
});

/**
 * POST /api/auth/invite
 * Creates an invitation for a new member to join the authenticated user's organization.
 * Requires: authenticated session with USER_INVITE permission.
 */
export const POST = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return createServerErrorResponse(
        'Invalid request body',
        400,
        'VALIDATION_ERROR',
      );
    }

    const { email, roleId } = parsed.data;
    const organizationId = access.tenant.organizationId;

    if (!organizationId) {
      return createServerErrorResponse(
        'Organization context required',
        409,
        'TENANT_CONTEXT_REQUIRED',
      );
    }

    const container = getAppContainer();
    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);

    const repository = new DrizzleInvitationRepository(db);
    const emailService = createEmailService({
      provider: env.EMAIL_PROVIDER,
      resendApiKey: env.RESEND_API_KEY,
      resendFromEmail: env.RESEND_FROM_EMAIL,
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
      smtpSecure: env.SMTP_SECURE,
      smtpUser: env.SMTP_USER,
      smtpPass: env.SMTP_PASS,
      smtpFromEmail: env.SMTP_FROM_EMAIL,
    });

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: env.NEXT_PUBLIC_APP_URL ?? '',
    });

    const invitation = await service.createInvitation({
      organizationId,
      invitedByUserId: access.identity.id,
      email,
      roleId,
    });

    if (env.AUTH_PROVIDER === 'clerk') {
      const bridge = new ClerkInvitationBridge();
      await bridge.sendOrganizationInvitation({
        clerkOrganizationId: organizationId,
        email,
        role: 'org:member',
        redirectUrl: `${env.NEXT_PUBLIC_APP_URL ?? ''}/auth/invite/${invitation.token}`,
      });
    }

    return createSuccessResponse({
      invitationId: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
    });
  }),
);
