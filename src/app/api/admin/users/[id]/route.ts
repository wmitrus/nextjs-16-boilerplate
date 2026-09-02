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

import { resolveAdminUsersScope } from '../users-admin-scope';

import { DrizzleAdminUsersService } from '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
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
 * The ABAC business-action gate (SEC-26): whether this actor may perform the
 * given `user:*` action in the admin panel at all. It does NOT decide which
 * rows are in reach -- that is the canonical per-operation `DataScope` from
 * `resolveAdminUsersScope`, AND-ed into the same SQL statement as the
 * requested `id`. `allowed: true` alone is never sufficient for a
 * client-supplied `id`. See SEC-26 in
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

    // Canonical per-operation scope (OZI-71 Slice 4B). A user outside the
    // caller's scope 404s exactly like a nonexistent id -- enforced in the
    // same DB predicate as the lookup (SEC-26), never a distinguishing 403
    // (avoids cross-tenant existence leaks). `null` is a legitimate
    // ordinary membership denial and maps to the same 404.
    const scope = await resolveAdminUsersScope(access, db);

    if (!scope) {
      return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
    }

    const service = new DrizzleAdminUsersService(db);
    const user = await service.findById(id, scope);

    if (!user) {
      return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
    }

    return createSuccessResponse({ user });
  }),
);

export const PATCH = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (request, context, access) => {
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

        const scope = await resolveAdminUsersScope(access, db);
        if (!scope) {
          return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
        }

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

      const scope = await resolveAdminUsersScope(access, db);
      if (!scope) {
        return createServerErrorResponse('User not found', 404, 'NOT_FOUND');
      }

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
  ),
);
