import { connection } from 'next/server';

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

import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { DefaultWaitlistService } from '@/modules/waitlist/infrastructure/DefaultWaitlistService';
import { DrizzleWaitlistRepository } from '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository';
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

function resolveService(container: ReturnType<typeof getAppContainer>) {
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
  return new DefaultWaitlistService(
    new DrizzleWaitlistRepository(db),
    emailService,
  );
}

/**
 * GET /api/admin/waitlist
 * Lists all pending waitlist entries.
 * Requires: authenticated provisioned user (admin role enforced separately).
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

    const service = resolveService(container);
    const entries = await service.listPending();

    return createSuccessResponse({ entries });
  }),
);
