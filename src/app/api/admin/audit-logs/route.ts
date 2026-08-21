import { connection } from 'next/server';
import { z } from 'zod';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { AUDIT_CATEGORIES } from '@/modules/audit-log/domain/category';
import { DrizzleAuditLogReadService } from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogReadService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-audit-logs',
});

const querySchema = z.object({
  category: z.enum(AUDIT_CATEGORIES).optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  actorUserId: z.string().trim().min(1).max(200).optional(),
  targetType: z.string().trim().min(1).max(100).optional(),
  targetId: z.string().trim().min(1).max(200).optional(),
  occurredAfter: z.coerce.date().optional(),
  occurredBefore: z.coerce.date().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(50)
    .transform((v) => Math.min(v, 200)),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

type AdminAccess = { allowed: boolean; isPlatformAdmin: boolean };

/**
 * Distinguishes an unscoped platform-admin grant from an ABAC grant scoped
 * to `tenantId`. See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
async function checkAdminAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
): Promise<AdminAccess> {
  if (isEnvBasedPlatformAdmin(email)) {
    return { allowed: true, isPlatformAdmin: true };
  }

  try {
    const authzService = container.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    );
    const allowed = await authzService.can({
      tenant: { tenantId },
      subject: { id: userId },
      resource: { type: RESOURCES.SECURITY, id: 'admin-panel' },
      action: ACTIONS.SECURITY_READ_AUDIT,
    });
    return { allowed, isPlatformAdmin: false };
  } catch {
    return { allowed: false, isPlatformAdmin: false };
  }
}

export const GET = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const container = getAppContainer();

    const adminAccess = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
    );

    if (!adminAccess.allowed) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const url = new URL(request.url);
    const queryResult = querySchema.safeParse({
      category: url.searchParams.get('category') ?? undefined,
      outcome: url.searchParams.get('outcome') ?? undefined,
      actorUserId: url.searchParams.get('actorUserId') ?? undefined,
      targetType: url.searchParams.get('targetType') ?? undefined,
      targetId: url.searchParams.get('targetId') ?? undefined,
      occurredAfter: url.searchParams.get('occurredAfter') ?? undefined,
      occurredBefore: url.searchParams.get('occurredBefore') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

    if (!queryResult.success) {
      return createServerErrorResponse(
        'Invalid query parameters',
        400,
        'VALIDATION_ERROR',
      );
    }

    const { limit, offset, ...filters } = queryResult.data;

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleAuditLogReadService(db);
    // An ABAC-authorized tenant caller only ever sees their own tenant's
    // events -- never another tenant's or platform-level (tenantId: null)
    // rows (SEC-26).
    const { events, total } = adminAccess.isPlatformAdmin
      ? await service.listGlobal(filters, { limit, offset })
      : await service.listForTenant(access.tenant.tenantId, filters, {
          limit,
          offset,
        });

    logger.info(
      {
        event: 'admin:audit_log_list',
        adminId: access.user.id,
        tenantId: access.tenant.tenantId,
        total,
      },
      'Admin audit log list fetched',
    );

    return createSuccessResponse({
      events,
      total,
      limit,
      offset,
      scope: adminAccess.isPlatformAdmin
        ? { isPlatformAdmin: true, tenantId: null }
        : { isPlatformAdmin: false, tenantId: access.tenant.tenantId },
    });
  }),
);
