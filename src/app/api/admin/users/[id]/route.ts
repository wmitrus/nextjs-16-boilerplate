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
  module: 'admin-users-id',
});

const patchBodySchema = z.object({
  displayName: z.string().min(1).max(100),
});

const deactivateBodySchema = z.object({
  action: z.literal('deactivate'),
});

async function checkAdminAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
  action: (typeof ACTIONS)[keyof typeof ACTIONS],
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
      action,
    });
  } catch {
    return false;
  }
}

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, context, access) => {
    await connection();

    const params = await context.params;
    const id = params['id'] as string;

    const container = getAppContainer();

    const isAdmin = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.USER_READ,
    );

    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const userRepo = container.resolve<UserRepository>(AUTH.USER_REPOSITORY);
    const user = await userRepo.findById(id);

    if (!user) {
      return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
    }

    return createSuccessResponse({ user });
  }),
);

export const PATCH = withErrorHandler(
  withNodeProvisioning(async (request, context, access) => {
    await connection();

    const params = await context.params;
    const id = params['id'] as string;

    const container = getAppContainer();

    const bodyText = await request.text();
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      return createServerErrorResponse(
        'Invalid JSON body',
        400,
        'VALIDATION_ERROR',
      );
    }

    const deactivateResult = deactivateBodySchema.safeParse(parsedBody);
    if (deactivateResult.success) {
      const isAdmin = await checkAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
        ACTIONS.USER_DEACTIVATE,
      );

      if (!isAdmin) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const userRepo = container.resolve<UserRepository>(AUTH.USER_REPOSITORY);
      const existing = await userRepo.findById(id);

      if (!existing) {
        return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
      }

      const deactivatedAt = new Date();
      await userRepo.deactivate(id, deactivatedAt);

      logger.info(
        {
          event: 'admin:user_deactivate',
          userId: id,
          adminId: access.user.id,
          tenantId: access.tenant.tenantId,
        },
        'User deactivated by admin',
      );

      return createSuccessResponse({ deactivatedAt });
    }

    const patchResult = patchBodySchema.safeParse(parsedBody);
    if (!patchResult.success) {
      return createServerErrorResponse(
        'Invalid request body',
        400,
        'VALIDATION_ERROR',
      );
    }

    const isAdmin = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.USER_UPDATE,
    );

    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const userRepo = container.resolve<UserRepository>(AUTH.USER_REPOSITORY);
    const existing = await userRepo.findById(id);

    if (!existing) {
      return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
    }

    await userRepo.updateProfile(id, {
      displayName: patchResult.data.displayName,
    });

    logger.info(
      {
        event: 'admin:user_update',
        userId: id,
        adminId: access.user.id,
        tenantId: access.tenant.tenantId,
      },
      'User profile updated by admin',
    );

    return createSuccessResponse({ updated: true });
  }),
);
