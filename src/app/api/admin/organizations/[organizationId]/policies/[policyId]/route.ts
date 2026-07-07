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
  PolicyNotFoundError,
  ProtectedPolicyDeletionError,
  RoleNotFoundError,
} from '@/modules/authorization/domain/errors';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DrizzleAdminPoliciesMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminPoliciesMutationService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const policyIdSchema = z.object({
  policyId: z.uuid(),
});

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

      if (error instanceof ProtectedPolicyDeletionError) {
        return createServerErrorResponse(error.message, 400, error.code);
      }

      throw error;
    }
  }),
);
