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
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { FeatureFlagNotFoundError } from '@/modules/feature-flags/domain/errors';
import { DrizzleFeatureFlagAdminService } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-feature-flags-id',
});

const idSchema = z.object({ id: z.uuid() });

const patchBodySchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().trim().max(500).nullable().optional(),
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
      resource: { type: RESOURCES.FEATURE_FLAG, id: 'admin-panel' },
      action: ACTIONS.FEATURE_FLAG_MANAGE,
    });
  } catch {
    return false;
  }
}

export const PATCH = withErrorHandler(
  withNodeProvisioning(async (request, context, access) => {
    await connection();

    const rawParams = await context.params;
    const idResult = idSchema.safeParse(rawParams);
    if (!idResult.success) {
      return createValidationErrorResponse(
        { id: ['Invalid feature flag id'] },
        400,
      );
    }
    const { id } = idResult.data;

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createServerErrorResponse(
        'Invalid request body',
        400,
        'VALIDATION_ERROR',
      );
    }

    const parseResult = patchBodySchema.safeParse(body);
    if (!parseResult.success) {
      return createServerErrorResponse(
        'Invalid request body',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (
      parseResult.data.enabled === undefined &&
      parseResult.data.description === undefined
    ) {
      return createServerErrorResponse(
        'At least one of enabled or description must be provided',
        400,
        'VALIDATION_ERROR',
      );
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleFeatureFlagAdminService(db);

    try {
      const flag = await service.update(id, {
        enabled: parseResult.data.enabled,
        description: parseResult.data.description,
      });

      logger.info(
        {
          event: 'admin:feature_flag_update',
          adminId: access.user.id,
          tenantId: access.tenant.tenantId,
          flagId: id,
          flagKey: flag.key,
        },
        'Feature flag updated by admin',
      );

      return createSuccessResponse({ flag });
    } catch (error) {
      if (error instanceof FeatureFlagNotFoundError) {
        return createServerErrorResponse(
          'Feature flag not found',
          404,
          'NOT_FOUND',
        );
      }

      throw error;
    }
  }),
);

export const DELETE = withErrorHandler(
  withNodeProvisioning(async (_request, context, access) => {
    await connection();

    const rawParams = await context.params;
    const idResult = idSchema.safeParse(rawParams);
    if (!idResult.success) {
      return createValidationErrorResponse(
        { id: ['Invalid feature flag id'] },
        400,
      );
    }
    const { id } = idResult.data;

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
    const service = new DrizzleFeatureFlagAdminService(db);

    try {
      await service.delete(id);

      logger.info(
        {
          event: 'admin:feature_flag_delete',
          adminId: access.user.id,
          tenantId: access.tenant.tenantId,
          flagId: id,
        },
        'Feature flag deleted by admin',
      );

      return createSuccessResponse({ deleted: true });
    } catch (error) {
      if (error instanceof FeatureFlagNotFoundError) {
        return createServerErrorResponse(
          'Feature flag not found',
          404,
          'NOT_FOUND',
        );
      }

      throw error;
    }
  }),
);
