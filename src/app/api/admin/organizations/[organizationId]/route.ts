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
  checkOrganizationsAdminAccess,
  getFieldErrors,
  organizationIdSchema,
} from '../_lib';

import { OrganizationNotFoundError } from '@/modules/authorization/domain/errors';
import { DrizzleAdminOrganizationsMutationService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsMutationService';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const patchBodySchema = z.object({
  status: z.enum(['active', 'archived']),
});

export const GET = withErrorHandler(
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
    const parseResult = organizationIdSchema.safeParse({
      id: params.organizationId,
    });

    if (!parseResult.success) {
      return createValidationErrorResponse(getFieldErrors(parseResult.error));
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleAdminOrganizationsReadService(db);
    const organization = await service.getDetailInActiveScope({
      activeOrganizationId: access.tenant.organizationId,
      organizationId: parseResult.data.id,
    });

    if (!organization) {
      return createServerErrorResponse(
        'Organization not found',
        404,
        'NOT_FOUND',
      );
    }

    return createSuccessResponse(organization);
  }),
);

export const PATCH = withErrorHandler(
  withNodeProvisioning(async (request, context, access) => {
    await connection();

    const container = getAppContainer();
    const canUpdateTenant = await checkOrganizationsActionAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
      ACTIONS.TENANT_UPDATE,
    );

    if (!canUpdateTenant) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const params = await context.params;
    const parseResult = organizationIdSchema.safeParse({
      id: params.organizationId,
    });

    if (!parseResult.success) {
      return createValidationErrorResponse(getFieldErrors(parseResult.error));
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createServerErrorResponse(
        'Invalid organization payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const bodyResult = patchBodySchema.safeParse(body);
    if (!bodyResult.success) {
      return createValidationErrorResponse(getFieldErrors(bodyResult.error));
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const readService = new DrizzleAdminOrganizationsReadService(db);
    const organization = await readService.getDetailInActiveScope({
      activeOrganizationId: access.tenant.organizationId,
      organizationId: parseResult.data.id,
    });

    if (!organization) {
      return createServerErrorResponse(
        'Organization not found',
        404,
        'NOT_FOUND',
      );
    }

    try {
      const mutationService = new DrizzleAdminOrganizationsMutationService(db);
      const updatedOrganization =
        await mutationService.updateOrganizationStatus({
          activeOrganizationId: access.tenant.organizationId,
          organizationId: parseResult.data.id,
          status: bodyResult.data.status,
        });

      await recordAdminAuditEvent({
        category: 'organization',
        action: 'organization.update_status',
        outcome: 'success',
        tenantId: access.tenant.tenantId,
        actorUserId: access.user.id,
        targetType: 'organization',
        targetId: parseResult.data.id,
      });

      return createSuccessResponse({ organization: updatedOrganization });
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return createServerErrorResponse(error.message, 404, error.code);
      }

      throw error;
    }
  }),
);
