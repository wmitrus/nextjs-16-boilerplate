import { and, eq } from 'drizzle-orm';
import { connection } from 'next/server';

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
  organizationIdSchema,
} from '../../../_lib';

import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { invitationsTable } from '@/modules/authorization/infrastructure/drizzle/schema';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

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
  withNodeProvisioning(async (_request, context, access) => {
    await connection();

    const container = getAppContainer();
    const isAdmin = await checkOrganizationsAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
    );

    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const params = await context.params;
    const paramsResult = organizationIdSchema.safeParse({
      id: params.organizationId,
    });

    if (!paramsResult.success) {
      return createValidationErrorResponse(getFieldErrors(paramsResult.error));
    }

    const invitationId = params.id;
    if (!invitationId || Array.isArray(invitationId)) {
      return createServerErrorResponse('Invalid id', 400, 'INVALID_ID');
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const readService = new DrizzleAdminOrganizationsReadService(db);
    const organization = await readService.getDetailInActiveScope({
      activeOrganizationId: access.tenant.organizationId,
      organizationId: paramsResult.data.id,
    });

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

    const invitationRows = await db
      .select({ id: invitationsTable.id })
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.id, invitationId),
          eq(invitationsTable.organizationId, paramsResult.data.id),
        ),
      )
      .limit(1);

    if (invitationRows.length === 0) {
      return createServerErrorResponse(
        'Invitation not found',
        404,
        'NOT_FOUND',
      );
    }

    const service = createInvitationService(db);
    await service.revokeInvitation(invitationId);

    return createSuccessResponse({ id: invitationId });
  }),
);
