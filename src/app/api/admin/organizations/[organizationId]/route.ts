import { connection } from 'next/server';

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
} from '../_lib';

import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

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
