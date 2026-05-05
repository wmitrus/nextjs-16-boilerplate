import { and, eq } from 'drizzle-orm';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createSuccessResponse,
  createServerErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  organizationsTable,
  rolesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import {
  WaitlistEntryNotFoundError,
  WaitlistEntryAlreadyProcessedError,
} from '@/modules/waitlist/domain/errors';
import { DefaultWaitlistService } from '@/modules/waitlist/infrastructure/DefaultWaitlistService';
import { DrizzleWaitlistRepository } from '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-waitlist',
});

function resolveServices() {
  const container = getAppContainer();
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
  const waitlistService = new DefaultWaitlistService(
    new DrizzleWaitlistRepository(db),
    emailService,
  );
  const invitationService = new DefaultInvitationService(
    new DrizzleInvitationRepository(db),
    emailService,
    { appUrl: env.NEXT_PUBLIC_APP_URL ?? '' },
  );
  return { waitlistService, invitationService, emailService, db };
}

/**
 * For TENANCY_MODE=single: the org ID is auto-generated at first-user provisioning
 * time and is not known at deploy time — it cannot be pre-set in env vars.
 * This helper resolves both the org ID and the member role ID from the DB using
 * DEFAULT_TENANT_ID, removing the need for WAITLIST_INVITE_ORGANIZATION_ID and
 * WAITLIST_INVITE_ROLE_ID when running in single-tenancy mode.
 */
async function resolveSingleTenancyInviteTarget(
  db: DrizzleDb,
): Promise<{ orgId: string; roleId: string } | null> {
  const tenantId = env.DEFAULT_TENANT_ID;
  if (!tenantId) return null;

  const orgRows = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.tenantId, tenantId))
    .limit(1);

  const orgId = orgRows[0]?.id;
  if (!orgId) return null;

  const roleRows = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(
      and(eq(rolesTable.organizationId, orgId), eq(rolesTable.name, 'member')),
    )
    .limit(1);

  const roleId = roleRows[0]?.id;
  if (!roleId) return null;

  return { orgId, roleId };
}

function isWaitlistError(
  error: unknown,
): error is WaitlistEntryNotFoundError | WaitlistEntryAlreadyProcessedError {
  return (
    error instanceof WaitlistEntryNotFoundError ||
    error instanceof WaitlistEntryAlreadyProcessedError
  );
}

/**
 * POST /api/admin/waitlist/[id]?action=approve|reject
 *
 * approve: marks the entry approved, then creates an invitation and sends the
 *          invite email. For TENANCY_MODE=single, org + member role are resolved
 *          automatically from the DB (WAITLIST_INVITE_ORGANIZATION_ID +
 *          WAITLIST_INVITE_ROLE_ID are optional overrides).
 * reject:  marks the entry rejected, sends a rejection email (opt-out via
 *          WAITLIST_SEND_REJECTION_EMAIL=false).
 *
 * Requires: authenticated provisioned user (admin).
 */
export const POST = withErrorHandler(
  withNodeProvisioning(async (_request, context) => {
    await connection();

    const params = await context.params;
    const id = params['id'];
    const action = _request.nextUrl.searchParams.get('action');

    if (!id || Array.isArray(id)) {
      return createServerErrorResponse('Invalid id', 400, 'INVALID_ID');
    }

    if (action !== 'approve' && action !== 'reject') {
      return createServerErrorResponse(
        'action must be approve or reject',
        400,
        'INVALID_ACTION',
      );
    }

    const { waitlistService, invitationService, emailService, db } =
      resolveServices();

    try {
      if (action === 'approve') {
        const entry = await waitlistService.approveEntry(id);

        let orgId = entry.organizationId ?? env.WAITLIST_INVITE_ORGANIZATION_ID;
        let roleId = env.WAITLIST_INVITE_ROLE_ID;

        if (!orgId || !roleId) {
          if (env.TENANCY_MODE === 'single') {
            const resolved = await resolveSingleTenancyInviteTarget(db);
            if (resolved) {
              orgId = orgId ?? resolved.orgId;
              roleId = roleId ?? resolved.roleId;
            }
          }
        }

        if (orgId && roleId) {
          try {
            await invitationService.createInvitation({
              organizationId: orgId,
              invitedByUserId: null,
              email: entry.email,
              roleId,
            });
          } catch (inviteErr) {
            const err =
              inviteErr instanceof Error
                ? inviteErr
                : new Error(String(inviteErr));
            logger.error(
              {
                event: 'waitlist:approval_invite_failed',
                waitlistEntryId: id,
                errorMessage: err.message,
                errorName: err.name,
              },
              'Waitlist approved but invitation creation failed',
            );
          }
        } else {
          logger.warn(
            {
              event: 'waitlist:approval_no_invite_config',
              waitlistEntryId: id,
              tenancyMode: env.TENANCY_MODE,
            },
            'Waitlist approved but could not resolve org/role for invitation — no invitation email sent',
          );
        }

        return createSuccessResponse({ entry });
      }

      const entry = await waitlistService.rejectEntry(id);

      if (env.WAITLIST_SEND_REJECTION_EMAIL) {
        try {
          await emailService.sendWaitlistRejectionEmail({
            to: entry.email,
            name: entry.name,
          });
        } catch (emailErr) {
          const err =
            emailErr instanceof Error ? emailErr : new Error(String(emailErr));
          logger.error(
            {
              event: 'waitlist:rejection_email_failed',
              waitlistEntryId: id,
              errorMessage: err.message,
              errorName: err.name,
            },
            'Failed to send waitlist rejection email',
          );
        }
      }

      return createSuccessResponse({ entry });
    } catch (error) {
      if (isWaitlistError(error)) {
        const status = error instanceof WaitlistEntryNotFoundError ? 404 : 409;
        return createServerErrorResponse(
          error.message,
          status,
          (error as { code: string }).code,
        );
      }
      throw error;
    }
  }),
);
