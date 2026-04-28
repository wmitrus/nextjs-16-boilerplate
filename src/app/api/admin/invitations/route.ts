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
  createSuccessResponse,
  createServerErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { rolesTable } from '@/modules/authorization/infrastructure/drizzle/schema';
import { DuplicateInvitationError } from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const createBodySchema = z.object({
  email: z.email(),
  roleId: z.uuid(),
});

function isEnvBasedPlatformAdmin(email: string | undefined): boolean {
  if (!email) return false;

  const rawEmails = process.env.ADMIN_USER_EMAILS;
  if (!rawEmails) return false;

  return rawEmails
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

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

function resolveServices(db: DrizzleDb) {
  const emailProvider = process.env.EMAIL_PROVIDER;
  const emailService = createEmailService({
    provider:
      emailProvider === 'resend' || emailProvider === 'smtp'
        ? emailProvider
        : 'none',
    resendApiKey: process.env.RESEND_API_KEY,
    resendFromEmail: process.env.RESEND_FROM_EMAIL,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL,
  });
  return new DefaultInvitationService(
    new DrizzleInvitationRepository(db),
    emailService,
    { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
  );
}

/**
 * GET /api/admin/invitations
 * Lists all invitations for the organization.
 * Requires: authenticated admin (env-based or ABAC SECURITY_MANAGE_POLICIES).
 */
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
    const organizationId = access.tenant.organizationId;

    const service = resolveServices(db);
    const invitations = await service.listByOrganization(organizationId);

    const safeInvitations = invitations.map(
      ({ token: _token, ...rest }) => rest,
    );

    return createSuccessResponse({ invitations: safeInvitations });
  }),
);

/**
 * POST /api/admin/invitations
 * Creates a direct invitation bypassing the waitlist.
 * Requires: authenticated admin (env-based or ABAC SECURITY_MANAGE_POLICIES).
 */
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

    const body = await request.json();
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
      return createServerErrorResponse(
        'Invalid request body',
        400,
        'VALIDATION_ERROR',
      );
    }

    const { email, roleId } = parsed.data;
    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const organizationId = access.tenant.organizationId;

    const roleRows = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.id, roleId),
          eq(rolesTable.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!roleRows[0]) {
      return createServerErrorResponse(
        'Role not found in organization',
        400,
        'VALIDATION_ERROR',
      );
    }

    const service = resolveServices(db);

    try {
      const invitation = await service.createInvitation({
        organizationId,
        invitedByUserId: access.user.id,
        email,
        roleId,
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
          error.message,
          409,
          'DUPLICATE_INVITATION',
        );
      }
      throw error;
    }
  }),
);
