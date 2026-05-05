import { and, eq } from 'drizzle-orm';
import { connection } from 'next/server';
import { z } from 'zod';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { rolesTable } from '@/modules/authorization/infrastructure/drizzle/schema';
import { DuplicateInvitationError } from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const bodySchema = z.object({
  email: z.email(),
  roleId: z.uuid(),
});

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
  withNodeProvisioning(async (request, _context, access) => {
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

    const parseResult = bodySchema.safeParse(await request.json());
    if (!parseResult.success) {
      return createServerErrorResponse(
        'Invalid invitation payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const roleRows = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.id, parseResult.data.roleId),
          eq(rolesTable.organizationId, access.tenant.organizationId),
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
        email: parseResult.data.email,
        roleId: parseResult.data.roleId,
        organizationId: access.tenant.organizationId,
        invitedByUserId: access.user.id,
        expiresInHours: 72,
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
);

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
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

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = createInvitationService(db);
    const invitations = await service.listByOrganization(
      access.tenant.organizationId,
    );

    return createSuccessResponse({
      invitations: invitations.map(({ token: _token, ...invitation }) => ({
        ...invitation,
      })),
    });
  }),
);
