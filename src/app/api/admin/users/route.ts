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

import { DrizzleAdminUsersService } from '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-users',
});

const querySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(50)
    .transform((v) => Math.min(v, 100)),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().max(200).optional(),
});

type AdminAccess = { allowed: boolean; isPlatformAdmin: boolean };

/**
 * Distinguishes an unscoped platform-admin grant from an ABAC grant scoped
 * to `tenantId`. Callers must not treat `allowed: true` alone as sufficient
 * authorization to reach users outside their own tenant -- check
 * `isPlatformAdmin` before allowing anything unscoped. See SEC-26 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
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
      resource: { type: RESOURCES.USER, id: 'admin-panel' },
      action: ACTIONS.USER_READ,
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
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    });

    if (!queryResult.success) {
      return createServerErrorResponse(
        'Invalid query parameters',
        400,
        'VALIDATION_ERROR',
      );
    }

    const { limit, offset, search } = queryResult.data;

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleAdminUsersService(db);
    // An ABAC-authorized (non-platform-admin) caller only ever sees users
    // who hold a membership in their own tenant -- never another tenant's
    // users (SEC-26).
    const scope = adminAccess.isPlatformAdmin
      ? null
      : { tenantId: access.tenant.tenantId };
    const { users, total } = await service.listAll(
      { limit, offset, search },
      scope,
    );

    logger.info(
      {
        event: 'admin:users_list',
        userId: access.user.id,
        tenantId: access.tenant.tenantId,
        limit,
        offset,
        total,
      },
      'Admin user list fetched',
    );

    return createSuccessResponse({ users, total, limit, offset });
  }),
);
