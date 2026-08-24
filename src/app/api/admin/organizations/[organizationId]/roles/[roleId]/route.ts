import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  checkOrganizationsAdminAccess,
  getFieldErrors,
  organizationIdSchema,
} from '../../../_lib';

import {
  DuplicateRoleNameError,
  ProtectedRoleDeletionError,
  ProtectedRoleMutationError,
  ProtectedSystemRoleNameError,
  RoleNotFoundError,
} from '@/modules/authorization/domain/errors';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DrizzleAdminRolesMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminRolesMutationService';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withAdminStepUp } from '@/security/api/with-admin-step-up';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const bodySchema = z.object({
  name: z.string().trim().min(2).max(50),
});

const roleIdSchema = z.object({
  roleId: z.uuid(),
});

export const PATCH = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (request, context, access) => {
      await connection();

      const container = getAppContainer();
      const isAdmin = await checkOrganizationsAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
      );

      if (!isAdmin) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const params = await context.params;
      const organizationResult = organizationIdSchema.safeParse({
        id: params.organizationId,
      });
      const roleResult = roleIdSchema.safeParse({ roleId: params.roleId });

      if (!organizationResult.success) {
        return createValidationErrorResponse(
          getFieldErrors(organizationResult.error),
        );
      }

      if (!roleResult.success) {
        return createValidationErrorResponse(getFieldErrors(roleResult.error));
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return createServerErrorResponse(
          'Invalid role payload',
          400,
          'VALIDATION_ERROR',
        );
      }

      const bodyResult = bodySchema.safeParse(body);
      if (!bodyResult.success) {
        return createValidationErrorResponse(getFieldErrors(bodyResult.error));
      }

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const readService = new DrizzleAdminOrganizationsReadService(db);
      const organization = await readService.getDetailInActiveScope({
        activeOrganizationId: access.tenant.organizationId,
        organizationId: organizationResult.data.id,
      });

      if (!organization) {
        return createServerErrorResponse(
          'Organization not found',
          404,
          'NOT_FOUND',
        );
      }

      if (organization.organization.status === 'archived') {
        return createServerErrorResponse(
          'Archived organizations cannot rename roles',
          409,
          'ARCHIVED_ORGANIZATION',
        );
      }

      const mutationService = new DrizzleAdminRolesMutationService(db);

      try {
        const role = await mutationService.renameCustomRole({
          organizationId: organizationResult.data.id,
          roleId: roleResult.data.roleId,
          name: bodyResult.data.name,
        });

        await recordAdminAuditEvent({
          category: 'rbac_policy',
          action: 'role.rename',
          outcome: 'success',
          tenantId: access.tenant.tenantId,
          actorUserId: access.user.id,
          targetType: 'role',
          targetId: roleResult.data.roleId,
        });

        return createSuccessResponse({ role });
      } catch (error) {
        if (error instanceof RoleNotFoundError) {
          return createServerErrorResponse(error.message, 404, error.code);
        }

        if (error instanceof DuplicateRoleNameError) {
          return createServerErrorResponse(error.message, 409, error.code);
        }

        if (
          error instanceof ProtectedSystemRoleNameError ||
          error instanceof ProtectedRoleMutationError
        ) {
          return createServerErrorResponse(error.message, 400, error.code);
        }

        throw error;
      }
    }),
  ),
);

export const DELETE = withErrorHandler(
  withNodeProvisioning(
    withAdminStepUp(async (_request, context, access) => {
      await connection();

      const container = getAppContainer();
      const isAdmin = await checkOrganizationsAdminAccess(
        access.identity.email,
        access.user.id,
        access.tenant.tenantId,
        container,
      );

      if (!isAdmin) {
        return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      const params = await context.params;
      const organizationResult = organizationIdSchema.safeParse({
        id: params.organizationId,
      });
      const roleResult = roleIdSchema.safeParse({ roleId: params.roleId });

      if (!organizationResult.success) {
        return createValidationErrorResponse(
          getFieldErrors(organizationResult.error),
        );
      }

      if (!roleResult.success) {
        return createValidationErrorResponse(getFieldErrors(roleResult.error));
      }

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const readService = new DrizzleAdminOrganizationsReadService(db);
      const organization = await readService.getDetailInActiveScope({
        activeOrganizationId: access.tenant.organizationId,
        organizationId: organizationResult.data.id,
      });

      if (!organization) {
        return createServerErrorResponse(
          'Organization not found',
          404,
          'NOT_FOUND',
        );
      }

      if (organization.organization.status === 'archived') {
        return createServerErrorResponse(
          'Archived organizations cannot delete roles',
          409,
          'ARCHIVED_ORGANIZATION',
        );
      }

      const mutationService = new DrizzleAdminRolesMutationService(db);

      try {
        await mutationService.deleteCustomRole({
          organizationId: organizationResult.data.id,
          roleId: roleResult.data.roleId,
        });

        await recordAdminAuditEvent({
          category: 'rbac_policy',
          action: 'role.delete',
          outcome: 'success',
          tenantId: access.tenant.tenantId,
          actorUserId: access.user.id,
          targetType: 'role',
          targetId: roleResult.data.roleId,
        });

        return createSuccessResponse({ roleId: roleResult.data.roleId });
      } catch (error) {
        if (error instanceof RoleNotFoundError) {
          return createServerErrorResponse(error.message, 404, error.code);
        }

        if (
          error instanceof ProtectedSystemRoleNameError ||
          error instanceof ProtectedRoleMutationError ||
          error instanceof ProtectedRoleDeletionError
        ) {
          return createServerErrorResponse(error.message, 400, error.code);
        }

        throw error;
      }
    }),
  ),
);
