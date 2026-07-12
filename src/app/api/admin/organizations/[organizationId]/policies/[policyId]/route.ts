import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import { isAction } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
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
  DuplicatePolicyError,
  PolicyNotFoundError,
  ProtectedPolicyDeletionError,
  ProtectedPolicyMutationError,
  RoleNotFoundError,
} from '@/modules/authorization/domain/errors';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DrizzleAdminPoliciesMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminPoliciesMutationService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const allowedResources = new Set<string>(Object.values(RESOURCES));
const allowedActions = new Set<string>(Object.values(ACTIONS));

const policyIdSchema = z.object({
  policyId: z.uuid(),
});

const bodySchema = z.object({
  effect: z.enum(['allow', 'deny']),
  resource: z.string(),
  actions: z.array(z.string()).min(1).max(20),
});

export const PATCH = withErrorHandler(
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
    const organizationResult = organizationIdSchema.safeParse({
      id: params.organizationId,
    });
    const policyResult = policyIdSchema.safeParse({
      policyId: params.policyId,
    });

    if (!organizationResult.success) {
      return createValidationErrorResponse(
        getFieldErrors(organizationResult.error),
      );
    }

    if (!policyResult.success) {
      return createValidationErrorResponse(getFieldErrors(policyResult.error));
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
      organizationId: organizationResult.data.id,
    });

    if (!organization) {
      return createServerErrorResponse(
        'Organization not found',
        404,
        'NOT_FOUND',
      );
    }

    const mutationService = new DrizzleAdminPoliciesMutationService(db);

    try {
      const policy = await mutationService.updateRolePolicy({
        organizationId: organizationResult.data.id,
        policyId: policyResult.data.policyId,
        effect: bodyResult.data.effect,
        resource: bodyResult.data.resource,
        actions: bodyResult.data.actions,
      });

      return createSuccessResponse({ policy });
    } catch (error) {
      if (
        error instanceof PolicyNotFoundError ||
        error instanceof RoleNotFoundError
      ) {
        return createServerErrorResponse(error.message, 404, error.code);
      }

      if (error instanceof DuplicatePolicyError) {
        return createServerErrorResponse(error.message, 409, error.code);
      }

      if (error instanceof ProtectedPolicyMutationError) {
        return createServerErrorResponse(error.message, 400, error.code);
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

export const DELETE = withErrorHandler(
  withNodeProvisioning(async (_request, context, access) => {
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
    const policyResult = policyIdSchema.safeParse({
      policyId: params.policyId,
    });

    if (!organizationResult.success) {
      return createValidationErrorResponse(
        getFieldErrors(organizationResult.error),
      );
    }

    if (!policyResult.success) {
      return createValidationErrorResponse(getFieldErrors(policyResult.error));
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

    const mutationService = new DrizzleAdminPoliciesMutationService(db);

    try {
      await mutationService.deleteRolePolicy({
        organizationId: organizationResult.data.id,
        policyId: policyResult.data.policyId,
      });

      return createSuccessResponse({ policyId: policyResult.data.policyId });
    } catch (error) {
      if (
        error instanceof PolicyNotFoundError ||
        error instanceof RoleNotFoundError
      ) {
        return createServerErrorResponse(error.message, 404, error.code);
      }

      if (error instanceof DuplicatePolicyError) {
        return createServerErrorResponse(error.message, 409, error.code);
      }

      if (error instanceof ProtectedPolicyDeletionError) {
        return createServerErrorResponse(error.message, 400, error.code);
      }

      if (error instanceof ProtectedPolicyMutationError) {
        return createServerErrorResponse(error.message, 400, error.code);
      }

      throw error;
    }
  }),
);
