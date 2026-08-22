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

import { DrizzleAdminUsersService } from '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'admin',
  module: 'admin-users-id',
});

const idSchema = z.object({ id: z.uuid() });

const patchBodySchema = z.object({
  displayName: z.string().min(1).max(100),
});

const deactivateBodySchema = z.object({
  action: z.literal('deactivate'),
});

type AdminAccess = { allowed: boolean; isPlatformAdmin: boolean };

/**
 * Distinguishes an unscoped platform-admin grant from an ABAC grant scoped
 * to `tenantId`. Callers must not treat `allowed: true` alone as sufficient
 * authorization for a client-supplied `id` naming a user who may belong to
 * another tenant -- check `isPlatformAdmin` and pass the resulting
 * `AdminUserScope` through to the service. See SEC-26 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
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
      resource: { type: RESOURCES.USER, id: 'admin-panel' },
      action,
    });
    return { allowed, isPlatformAdmin: false };
  } catch {
    return { allowed: false, isPlatformAdmin: false };
  }
}

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, context, access) => {
    await connection();

    const rawParams = await context.params;
    const idResult = idSchema.safeParse(rawParams);
    if (!idResult.success) {
      return createValidationErrorResponse({ id: ['Invalid user id'] }, 400);
    }
    const { id } = idResult.data;

    const container = getAppContainer();

    const adminAccess = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.USER_READ,
    );

    if (!adminAccess.allowed) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleAdminUsersService(db);
    // An ABAC-authorized (non-platform-admin) caller may only read a user
    // who belongs to their own tenant, regardless of which `id` they supply
    // -- enforced in the same DB predicate as the lookup itself (SEC-26).
    // A user outside the caller's tenant must 404 exactly like a
    // nonexistent id, never a distinguishing 403 (avoids cross-tenant
    // existence leaks).
    const scope = adminAccess.isPlatformAdmin
      ? null
      : { tenantId: access.tenant.tenantId };
    const user = await service.findById(id, scope);

    if (!user) {
      return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
    }

    return createSuccessResponse({ user });
  }),
);

export const PATCH = withErrorHandler(
  withNodeProvisioning(async (request, context, access) => {
    await connection();

    const rawParams = await context.params;
    const idResult = idSchema.safeParse(rawParams);
    if (!idResult.success) {
      return createValidationErrorResponse({ id: ['Invalid user id'] }, 400);
    }
    const { id } = idResult.data;

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

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleAdminUsersService(db);

    const deactivateResult = deactivateBodySchema.safeParse(parsedBody);
    if (deactivateResult.success) {
      const adminAccess = await checkAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
        ACTIONS.USER_DEACTIVATE,
      );

      if (!adminAccess.allowed) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const scope = adminAccess.isPlatformAdmin
        ? null
        : { tenantId: access.tenant.tenantId };
      const deactivatedAt = new Date();
      const deactivated = await service.deactivate(id, deactivatedAt, scope);

      if (!deactivated) {
        return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
      }

      logger.info(
        {
          event: 'admin:user_deactivate',
          userId: id,
          adminId: access.user.id,
          tenantId: access.tenant.tenantId,
        },
        'User deactivated by admin',
      );

      await recordAdminAuditEvent({
        category: 'admin_access',
        action: 'user.deactivate',
        outcome: 'success',
        tenantId: access.tenant.tenantId,
        actorUserId: access.user.id,
        targetType: 'user',
        targetId: id,
      });

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

    const adminAccess = await checkAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.USER_UPDATE,
    );

    if (!adminAccess.allowed) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const scope = adminAccess.isPlatformAdmin
      ? null
      : { tenantId: access.tenant.tenantId };
    const updated = await service.updateProfile(
      id,
      { displayName: patchResult.data.displayName },
      scope,
    );

    if (!updated) {
      return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
    }

    logger.info(
      {
        event: 'admin:user_update',
        userId: id,
        adminId: access.user.id,
        tenantId: access.tenant.tenantId,
      },
      'User profile updated by admin',
    );

    await recordAdminAuditEvent({
      category: 'admin_access',
      action: 'user.update',
      outcome: 'success',
      tenantId: access.tenant.tenantId,
      actorUserId: access.user.id,
      targetType: 'user',
      targetId: id,
    });

    return createSuccessResponse({ updated: true });
  }),
);
