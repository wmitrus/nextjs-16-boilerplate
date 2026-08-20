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
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
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

type AdminAccess = { allowed: boolean; isPlatformAdmin: boolean };

/**
 * Distinguishes an unscoped platform-admin grant from an ABAC grant scoped
 * to `tenantId`. Callers must not treat `allowed: true` alone as sufficient
 * authorization for a client-supplied scope (tenantId, cross-tenant row) --
 * check `isPlatformAdmin` before allowing anything outside the caller's own
 * tenant. See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
async function checkAdminAccess(
  email: string | undefined,
  userId: string,
  tenantId: string,
  container: ReturnType<typeof getAppContainer>,
  action: (typeof ACTIONS)[keyof typeof ACTIONS],
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
      resource: { type: RESOURCES.FEATURE_FLAG, id: 'admin-panel' },
      action,
    });
    return { allowed, isPlatformAdmin: false };
  } catch {
    return { allowed: false, isPlatformAdmin: false };
  }
}

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    await connection();

    const container = getAppContainer();

    const adminAccess = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.FEATURE_FLAG_READ,
    );

    if (!adminAccess.allowed) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleFeatureFlagAdminService(db);
    // An ABAC-authorized tenant owner only sees global defaults plus their
    // own tenant's rows -- never another tenant's overrides (SEC-26).
    const flags = adminAccess.isPlatformAdmin
      ? await service.listAll()
      : await service.listForTenant(access.tenant.tenantId);

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
      // Lets the client render mutation controls only for rows the caller
      // can actually mutate -- an ABAC-authorized tenant owner sees global
      // rows (via listForTenant above) but cannot toggle/edit/delete them;
      // without this the client has no way to know that (SEC-26 follow-up:
      // PR #71 review).
      scope: adminAccess.isPlatformAdmin
        ? { isPlatformAdmin: true, tenantId: null }
        : { isPlatformAdmin: false, tenantId: access.tenant.tenantId },
    });
  }),
);

export const POST = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const container = getAppContainer();

    const adminAccess = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.FEATURE_FLAG_MANAGE,
    );

    if (!adminAccess.allowed) {
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

    // An ABAC-authorized (non-platform-admin) caller may only ever create
    // rows scoped to their own verified tenant -- derive the scope from
    // `access.tenant.tenantId` rather than trusting (or rejecting) the
    // client-supplied `tenantId`. Rejecting on mismatch instead of deriving
    // would 403 the normal "Create flag" form for these callers, since the
    // client has no way to know its own internal tenant id ahead of time
    // (SEC-26 follow-up: PR #71 review). Platform admins keep full control,
    // including creating global (`null`) rows.
    const requestedTenantId = adminAccess.isPlatformAdmin
      ? (parseResult.data.tenantId ?? null)
      : access.tenant.tenantId;

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleFeatureFlagAdminService(db);

    try {
      const flag = await service.create({
        key: parseResult.data.key,
        tenantId: requestedTenantId,
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

      await recordAdminAuditEvent({
        category: 'feature_flag',
        action: 'feature_flag.create',
        outcome: 'success',
        tenantId: access.tenant.tenantId,
        actorUserId: access.user.id,
        targetType: 'feature_flag',
        targetId: flag.id,
      });

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
