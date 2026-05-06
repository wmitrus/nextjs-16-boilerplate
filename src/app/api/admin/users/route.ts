import { connection } from 'next/server';
import { z } from 'zod';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { UserRepository } from '@/core/contracts/user';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

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
      resource: { type: RESOURCES.USER, id: 'admin-panel' },
      action: ACTIONS.USER_READ,
    });
  } catch {
    return false;
  }
}

export const GET = withErrorHandler(
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

    const userRepo = container.resolve<UserRepository>(AUTH.USER_REPOSITORY);
    const { users, total } = await userRepo.listAll({ limit, offset, search });

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
