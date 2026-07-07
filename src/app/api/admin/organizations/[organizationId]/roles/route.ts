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
} from '../../_lib';

import {
  DuplicateRoleNameError,
  ProtectedSystemRoleNameError,
} from '@/modules/authorization/domain/errors';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DrizzleAdminRolesMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminRolesMutationService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const bodySchema = z.object({
  name: z.string().trim().min(2).max(50),
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
      organizationId: paramsResult.data.id,
    });

    if (!organization) {
      return createServerErrorResponse(
        'Organization not found',
        404,
        'NOT_FOUND',
      );
    }

    const mutationService = new DrizzleAdminRolesMutationService(db);

    try {
      const role = await mutationService.createCustomRole({
        organizationId: paramsResult.data.id,
        name: bodyResult.data.name,
      });

      return createSuccessResponse({ role }, 201);
    } catch (error) {
      if (error instanceof DuplicateRoleNameError) {
        return createServerErrorResponse(error.message, 409, error.code);
      }

      if (error instanceof ProtectedSystemRoleNameError) {
        return createServerErrorResponse(error.message, 400, error.code);
      }

      throw error;
    }
  }),
);
