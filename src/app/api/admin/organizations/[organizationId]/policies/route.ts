import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import { isAction } from '@/core/contracts/authorization';
import {
  ACTIONS,
  RESOURCES,
  type Resource,
} from '@/core/contracts/resources-actions';
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
} from '../../_lib';

import {
  DuplicatePolicyError,
  RoleNotFoundError,
} from '@/modules/authorization/domain/errors';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DrizzleAdminPoliciesMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminPoliciesMutationService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const allowedResources = new Set<string>(Object.values(RESOURCES));
const allowedActions = new Set<string>(Object.values(ACTIONS));
const resourceOptions = Object.values(RESOURCES) as [Resource, ...Resource[]];

const bodySchema = z.object({
  roleId: z.uuid(),
  effect: z.enum(['allow', 'deny']),
  resource: z.enum(resourceOptions),
  actions: z.array(z.string()).min(1).max(20),
});

export const POST = withErrorHandler(
  withNodeProvisioning(async (request, context, access) => {
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
    const paramsResult = organizationIdSchema.safeParse({
      id: params.organizationId,
    });

    if (!paramsResult.success) {
      return createValidationErrorResponse(getFieldErrors(paramsResult.error));
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createServerErrorResponse(
        'Invalid policy payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const bodyResult = bodySchema.safeParse(body);
    if (!bodyResult.success) {
      return createValidationErrorResponse(getFieldErrors(bodyResult.error));
    }

    if (!allowedResources.has(bodyResult.data.resource)) {
      return createServerErrorResponse(
        'Unknown resource',
        400,
        'VALIDATION_ERROR',
      );
    }

    const invalidAction = bodyResult.data.actions.find(
      (action) => !isAction(action) || !allowedActions.has(action),
    );

    if (invalidAction) {
      return createServerErrorResponse(
        `Unknown action: ${invalidAction}`,
        400,
        'VALIDATION_ERROR',
      );
    }

    if (
      bodyResult.data.actions.some(
        (action) => !action.startsWith(`${bodyResult.data.resource}:`),
      )
    ) {
      return createServerErrorResponse(
        'All actions must belong to the selected resource',
        400,
        'VALIDATION_ERROR',
      );
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const readService = new DrizzleAdminOrganizationsReadService(db);
    const organization = await readService.getDetailInActiveScope({
      activeOrganizationId: access.tenant.organizationId,
      organizationId: paramsResult.data.id,
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
        'Archived organizations cannot create policies',
        409,
        'ARCHIVED_ORGANIZATION',
      );
    }

    const mutationService = new DrizzleAdminPoliciesMutationService(db);

    try {
      const policy = await mutationService.createRolePolicy({
        organizationId: paramsResult.data.id,
        roleId: bodyResult.data.roleId,
        effect: bodyResult.data.effect,
        resource: bodyResult.data.resource,
        actions: bodyResult.data.actions,
      });

      return createSuccessResponse({ policy }, 201);
    } catch (error) {
      if (error instanceof RoleNotFoundError) {
        return createServerErrorResponse(error.message, 404, error.code);
      }

      if (error instanceof DuplicatePolicyError) {
        return createServerErrorResponse(error.message, 409, error.code);
      }

      if (error instanceof Error) {
        return createServerErrorResponse(
          error.message,
          400,
          'VALIDATION_ERROR',
        );
      }

      throw error;
    }
  }),
);
