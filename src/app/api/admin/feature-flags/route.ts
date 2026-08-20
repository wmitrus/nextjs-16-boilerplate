import { connection } from 'next/server';
import { z } from 'zod';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { DuplicateFeatureFlagError } from '@/modules/feature-flags/domain/errors';
import { DrizzleFeatureFlagAdminService } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-feature-flags',
});

const createBodySchema = z.object({
  key: z.string().trim().min(1).max(200),
  tenantId: z.string().trim().min(1).max(200).nullable().optional(),
  enabled: z.boolean(),
  description: z.string().trim().max(500).nullable().optional(),
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
      resource: { type: RESOURCES.FEATURE_FLAG, id: 'admin-panel' },
      action,
    });
  } catch {
    return false;
  }
}

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    await connection();

    const container = getAppContainer();

    const isAdmin = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.FEATURE_FLAG_READ,
    );

    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleFeatureFlagAdminService(db);
    const flags = await service.listAll();

    logger.info(
      {
        event: 'admin:feature_flag_list',
        adminId: access.user.id,
        tenantId: access.tenant.tenantId,
        total: flags.length,
      },
      'Admin feature flag list fetched',
    );

    return createSuccessResponse({
      flags,
      activeProvider: env.FEATURE_FLAG_PROVIDER,
    });
  }),
);

export const POST = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const container = getAppContainer();

    const isAdmin = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.FEATURE_FLAG_MANAGE,
    );

    if (!isAdmin) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createServerErrorResponse(
        'Invalid feature flag payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const parseResult = createBodySchema.safeParse(body);
    if (!parseResult.success) {
      return createServerErrorResponse(
        'Invalid feature flag payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleFeatureFlagAdminService(db);

    try {
      const flag = await service.create({
        key: parseResult.data.key,
        tenantId: parseResult.data.tenantId ?? null,
        enabled: parseResult.data.enabled,
        description: parseResult.data.description ?? null,
      });

      logger.info(
        {
          event: 'admin:feature_flag_create',
          adminId: access.user.id,
          tenantId: access.tenant.tenantId,
          flagKey: flag.key,
          flagTenantId: flag.tenantId,
        },
        'Feature flag created by admin',
      );

      return createSuccessResponse({ flag }, 201);
    } catch (error) {
      if (error instanceof DuplicateFeatureFlagError) {
        return createServerErrorResponse(
          error.message,
          409,
          'DUPLICATE_FEATURE_FLAG',
        );
      }

      throw error;
    }
  }),
);
