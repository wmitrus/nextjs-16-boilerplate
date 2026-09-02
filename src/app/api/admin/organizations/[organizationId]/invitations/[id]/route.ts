import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  checkOrganizationsAdminAccess,
  getFieldErrors,
  getOrganizationDetailInActiveScope,
  organizationIdSchema,
} from '../../../_lib';

import { resolveOrganizationsAdminScope } from '@/app/admin/organizations/organizations-admin-scope';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const invitationIdSchema = z.object({
  id: z.uuid(),
});

function createInvitationService(db: DrizzleDb): DefaultInvitationService {
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

  return new DefaultInvitationService(
    new DrizzleInvitationRepository(db),
    emailService,
    { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
  );
}

export const DELETE = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (_request, context, access) => {
      await connection();

      const container = getAppContainer();
      const adminAccess = await checkOrganizationsAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
      );

      if (!adminAccess.allowed) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const params = await context.params;
      const paramsResult = organizationIdSchema.safeParse({
        id: params.organizationId,
      });
      const invitationResult = invitationIdSchema.safeParse({ id: params.id });

      if (!paramsResult.success) {
        return createValidationErrorResponse(
          getFieldErrors(paramsResult.error),
        );
      }

      if (!invitationResult.success) {
        return createValidationErrorResponse(
          getFieldErrors(invitationResult.error),
        );
      }

      const invitationId = invitationResult.data.id;

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const scope = await resolveOrganizationsAdminScope(access, db);

      if (!scope) {
        return createServerErrorResponse(
          'Organization not found',
          404,
          'NOT_FOUND',
        );
      }

      const readService = new DrizzleAdminOrganizationsReadService(db);
      const organization = await getOrganizationDetailInActiveScope(
        readService,
        scope,
        paramsResult.data.id,
        'invitations',
      );

      if (!organization) {
        return createServerErrorResponse(
          'Organization not found',
          404,
          'NOT_FOUND',
        );
      }

      if (organization.organization.status === 'archived') {
        return createServerErrorResponse(
          'Archived organizations cannot revoke invitations',
          409,
          'ARCHIVED_ORGANIZATION',
        );
      }

      const service = createInvitationService(db);

      // The organization is passed down into the UPDATE predicate itself, not
      // checked by a preceding SELECT. A `SELECT id + organizationId` followed
      // by `UPDATE ... WHERE id` authorises on a row as it was a moment ago and
      // then writes with no scope of its own. Here the scope and the write are
      // one statement.
      //
      // The scope is always the organization from the path -- never `null`,
      // not even for a platform admin. `null` is the unscoped path in
      // `revokePendingScoped`, and there is nothing unscoped about this route:
      // the caller named an organization, and `getDetailInActiveScope` above
      // already confirmed that organization is reachable from their active
      // scope. See SEC-41.
      const revoked = await service.revokeInvitation(
        invitationId,
        paramsResult.data.id,
      );

      if (!revoked) {
        // Deliberately the same 404 whether the invitation does not exist,
        // belongs to another organization, or is no longer pending -- an admin
        // of one organization must not be able to probe another's invitation
        // ids by the shape of the error.
        return createServerErrorResponse(
          'Invitation not found',
          404,
          'NOT_FOUND',
        );
      }

      await recordAdminAuditEvent({
        category: 'membership',
        action: 'invitation.revoke',
        outcome: 'success',
        tenantId: access.tenant.tenantId,
        actorUserId: access.user.id,
        targetType: 'invitation',
        targetId: invitationId,
      });

      return createSuccessResponse({ id: invitationId });
    }),
  ),
);
