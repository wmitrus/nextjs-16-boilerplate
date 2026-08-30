import { and, eq } from 'drizzle-orm';
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
  toAdminOrganizationsScope,
} from '../../_lib';

import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { rolesTable } from '@/modules/authorization/infrastructure/drizzle/schema';
import { DuplicateInvitationError } from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const bodySchema = z.object({
  email: z.email(),
  roleId: z.uuid(),
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

export const POST = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (request, context, access) => {
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

      if (!paramsResult.success) {
        return createValidationErrorResponse(
          getFieldErrors(paramsResult.error),
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return createServerErrorResponse(
          'Invalid invitation payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      const bodyResult = bodySchema.safeParse(body);
      if (!bodyResult.success) {
        return createValidationErrorResponse(getFieldErrors(bodyResult.error));
      }

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const readService = new DrizzleAdminOrganizationsReadService(db);
      const organization = await getOrganizationDetailInActiveScope(
        readService,
        toAdminOrganizationsScope(adminAccess, access.tenant.organizationId),
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
          'Archived organizations cannot create invitations',
          409,
          'ARCHIVED_ORGANIZATION',
        );
      }

      const roleRows = await db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(
          and(
            eq(rolesTable.id, bodyResult.data.roleId),
            eq(rolesTable.organizationId, paramsResult.data.id),
          ),
        )
        .limit(1);

      if (roleRows.length === 0) {
        return createServerErrorResponse(
          'Role does not belong to this organization',
          400,
          'VALIDATION_ERROR',
        );
      }

      const service = createInvitationService(db);

      try {
        const invitation = await service.createInvitation({
          email: bodyResult.data.email,
          roleId: bodyResult.data.roleId,
          organizationId: paramsResult.data.id,
          invitedByUserId: access.user.id,
          expiresInHours: 72,
        });

        await recordAdminAuditEvent({
          category: 'membership',
          action: 'invitation.create',
          outcome: 'success',
          tenantId: access.tenant.tenantId,
          actorUserId: access.user.id,
          targetType: 'invitation',
          targetId: invitation.id,
        });

        return createSuccessResponse(
          {
            invitationId: invitation.id,
            email: invitation.email,
            expiresAt: invitation.expiresAt.toISOString(),
          },
          201,
        );
      } catch (error) {
        if (error instanceof DuplicateInvitationError) {
          return createServerErrorResponse(
            'A pending invitation already exists for this email',
            409,
            'DUPLICATE_INVITATION',
          );
        }

        throw error;
      }
    }),
  ),
);
