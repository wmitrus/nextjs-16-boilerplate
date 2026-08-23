import { connection } from 'next/server';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createSuccessResponse,
  createServerErrorResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { parseUuidRouteParam } from '@/shared/lib/api/uuid-route-param';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { InvitationNotFoundError } from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

async function checkAdminAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
): Promise<boolean> {
  if (isEnvBasedPlatformAdmin(email)) return true;

  try {
    const authzService = container.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    );
    return await authzService.can({
      tenant: { tenantId },
      subject: { id: userId },
      resource: { type: RESOURCES.SECURITY, id: 'admin-panel' },
      action: ACTIONS.SECURITY_MANAGE_POLICIES,
    });
  } catch {
    return false;
  }
}

/**
 * DELETE /api/admin/invitations/[id]
 * Revokes a pending invitation.
 * Requires: authenticated admin (env-based or ABAC SECURITY_MANAGE_POLICIES).
 */
export const DELETE = withErrorHandler(
  withNodeProvisioning(async (_request, context, access) => {
    await connection();

    const container = getAppContainer();
    const isAdmin = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
    );
    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const params = await context.params;
    // SEC-23: revokeInvitation binds this straight to invitationsTable.id (uuid), so a shape check alone is not enough -- a malformed
    // segment would reach the driver and surface as a 500 instead of a 400.
    const idResult = parseUuidRouteParam(params, 'id');
    if (!idResult.ok) {
      return createValidationErrorResponse(idResult.fieldErrors, 400);
    }
    const id = idResult.value;

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
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
    const service = new DefaultInvitationService(
      new DrizzleInvitationRepository(db),
      emailService,
      { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
    );

    try {
      await service.revokeInvitation(id);

      await recordAdminAuditEvent({
        category: 'membership',
        action: 'invitation.revoke',
        outcome: 'success',
        tenantId: access.tenant.tenantId,
        actorUserId: access.user.id,
        targetType: 'invitation',
        targetId: id,
      });

      return createSuccessResponse({ id });
    } catch (error) {
      if (error instanceof InvitationNotFoundError) {
        return createServerErrorResponse(
          'Invitation not found',
          404,
          'NOT_FOUND',
        );
      }
      throw error;
    }
  }),
);
