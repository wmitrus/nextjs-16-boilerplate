import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import { ACTIONS } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import {
  checkOrganizationsActionAccess,
  getFieldErrors,
  organizationIdSchema,
} from '../../../_lib';

import {
  MembershipNotFoundError,
  ProtectedMembershipMutationError,
  RoleNotFoundError,
} from '@/modules/authorization/domain/errors';
import { DrizzleAdminMembershipsMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminMembershipsMutationService';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const userIdSchema = z.object({
  userId: z.uuid(),
});

const bodySchema = z.object({
  roleId: z.uuid(),
});

export const PATCH = withErrorHandler(
  withNodeProvisioning(async (request, context, access) => {
    await connection();

    const container = getAppContainer();
    const canManageMembers = await checkOrganizationsActionAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.TENANT_MANAGE_MEMBERS,
    );

    if (!canManageMembers) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const params = await context.params;
    const organizationResult = organizationIdSchema.safeParse({
      id: params.organizationId,
    });
    const userResult = userIdSchema.safeParse({ userId: params.userId });

    if (!organizationResult.success) {
      return createValidationErrorResponse(
        getFieldErrors(organizationResult.error),
      );
    }

    if (!userResult.success) {
      return createValidationErrorResponse(getFieldErrors(userResult.error));
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createServerErrorResponse(
        'Invalid member payload',
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
        'Archived organizations cannot change member roles',
        409,
        'ARCHIVED_ORGANIZATION',
      );
    }

    const mutationService = new DrizzleAdminMembershipsMutationService(db);

    try {
      const membership = await mutationService.updateMemberRole({
        organizationId: organizationResult.data.id,
        userId: userResult.data.userId,
        roleId: bodyResult.data.roleId,
      });

      return createSuccessResponse({ membership });
    } catch (error) {
      if (
        error instanceof MembershipNotFoundError ||
        error instanceof RoleNotFoundError
      ) {
        return createServerErrorResponse(error.message, 404, error.code);
      }

      if (error instanceof ProtectedMembershipMutationError) {
        return createServerErrorResponse(error.message, 400, error.code);
      }

      throw error;
    }
  }),
);
