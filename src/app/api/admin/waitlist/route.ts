import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
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

/**
 * The waitlist is **platform-global**, not tenant-local: entries are created
 * by anonymous visitors before they belong anywhere, `tenant_id` is never
 * written, and `organization_id` is whatever the joiner claimed. There is
 * therefore no trustworthy scope to filter by, and no scoped grant that
 * could be honest about what it authorises.
 *
 * So the ABAC path is deliberately absent here. `SECURITY_MANAGE_POLICIES`
 * is evaluated against the caller's ACTIVE TENANT, so every tenant owner
 * holds it -- and granting it access to an unscoped `listPending()` let one
 * tenant's owner read (and act on) every other tenant's applicants. Only an
 * env-based platform admin, whose grant genuinely is unscoped, may reach
 * these routes. See SEC-41.
 */
async function checkPlatformAdminAccess(
  email: string | undefined,
): Promise<boolean> {
  return isEnvBasedPlatformAdmin(email);
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
 *
 * Lists all pending waitlist entries across the whole platform -- the query
 * is unscoped, and there is no tenant column to scope it by.
 *
 * Requires: an env-based platform admin. See `checkPlatformAdminAccess`
 * above and SEC-41 for why a tenant-scoped ABAC grant is not accepted here.
 */
export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    await connection();

    const container = getAppContainer();
    const isAdmin = await checkPlatformAdminAccess(access.identity.email);
    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const service = resolveService(container);
    const entries = await service.listPending();

    return createSuccessResponse({ entries });
  }),
);
