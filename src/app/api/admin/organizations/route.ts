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
  organizationsQuerySchema,
  toAdminOrganizationsScope,
} from './_lib';

import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

export const GET = withErrorHandler(
  withNodeProvisioning(async (request, _context, access) => {
    await connection();

    const container = getAppContainer();
    const adminAccess = await checkOrganizationsAdminAccess(
      access.identity.email,
      access.user.id,
      access.tenant.tenantId,
      container,
    );

    if (!adminAccess.allowed) {
      return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const url = new URL(request.url);
    const queryResult = organizationsQuerySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    });

    if (!queryResult.success) {
      const tree = z.treeifyError(queryResult.error);
      const fieldErrors = Object.fromEntries(
        Object.entries(tree.properties ?? {}).flatMap(([key, value]) =>
          value?.errors?.length ? [[key, value.errors]] : [],
        ),
      );

      return createValidationErrorResponse(fieldErrors);
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DrizzleAdminOrganizationsReadService(db);
    const result = await service.listInActiveScope({
      scope: toAdminOrganizationsScope(
        adminAccess,
        access.tenant.organizationId,
      ),
      ...queryResult.data,
    });

    return createSuccessResponse({
      organizations: result.organizations,
      total: result.total,
      limit: queryResult.data.limit,
      offset: queryResult.data.offset,
    });
  }),
);
