import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { createSuccessResponse } from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { createEmailService } from '@/modules/invitations/infrastructure/EmailServiceFactory';
import { DefaultWaitlistService } from '@/modules/waitlist/infrastructure/DefaultWaitlistService';
import { DrizzleWaitlistRepository } from '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

function resolveService() {
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
  withNodeProvisioning(async (_request, _context, _access) => {
    await connection();

    const service = resolveService();
    const entries = await service.listPending();

    return createSuccessResponse({ entries });
  }),
);
