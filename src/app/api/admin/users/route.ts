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

import { resolveAdminUsersScope } from './users-admin-scope';

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
 * The ABAC business-action gate (SEC-26): whether this actor may perform
 * `user:read` in the admin panel at all. It does NOT decide which rows are in
 * reach -- that is the canonical per-operation `DataScope` from
 * `resolveAdminUsersScope`, AND-ed into the same SQL statement as the query.
 * `allowed: true` alone is never sufficient to reach a user. See SEC-26 in
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

    // Canonical per-operation scope (OZI-71 Slice 4B): `organization` for an
    // ordinary ABAC admin, explicit `platform-global` for an env platform
    // admin. `null` is a legitimate fail-closed ordinary membership denial --
    // never a legacy `{ tenantId }` fallback, never an unscoped query.
    const scope = await resolveAdminUsersScope(access, db);

    if (!scope) {
      return createSuccessResponse({ users: [], total: 0, limit, offset });
    }

    const service = new DrizzleAdminUsersService(db);
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
