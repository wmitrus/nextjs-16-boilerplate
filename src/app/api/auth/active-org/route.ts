import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { MembershipRepository } from '@/core/contracts/repositories';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
} from '@/shared/lib/api/response-service';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';
import { organizationsTable } from '@/modules/authorization/infrastructure/drizzle/schema';

const bodySchema = z.object({
  organizationId: z.uuid(),
});

function getLogger() {
  return resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'active-org-route',
  });
}

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    return createServerErrorResponse('Not available', 404, 'NOT_AVAILABLE');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createServerErrorResponse(
      'Invalid request body',
      400,
      'INVALID_BODY',
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return createValidationErrorResponse(
      { organizationId: ['Invalid organization ID'] },
      422,
    );
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return createServerErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  try {
    const container = getAppContainer();
    const membershipRepository = container.resolve<MembershipRepository>(
      AUTHORIZATION.MEMBERSHIP_REPOSITORY,
    );
    const isMember = await membershipRepository.isMember(
      userId,
      parsed.data.organizationId,
    );

    if (!isMember) {
      return createServerErrorResponse(
        'Organization membership required',
        403,
        'MEMBERSHIP_REQUIRED',
      );
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const organizationRows = await db
      .select({ status: organizationsTable.status })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, parsed.data.organizationId))
      .limit(1);

    if (organizationRows[0]?.status === 'archived') {
      return createServerErrorResponse(
        'Archived organizations cannot be set as active',
        409,
        'ORGANIZATION_ARCHIVED',
      );
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    getLogger().error(
      {
        event: 'auth:active_org_membership_check_failed',
        errorMessage: error.message,
        errorName: error.name,
      },
      'Failed to validate organization switch request',
    );
    return createServerErrorResponse('Unable to switch organization', 500);
  }

  const cookieStore = await cookies();
  cookieStore.set(env.TENANT_CONTEXT_COOKIE, parsed.data.organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.NODE_ENV === 'production',
  });

  getLogger().debug(
    {
      event: 'auth:active_org_switched',
      userId,
      organizationId: parsed.data.organizationId,
    },
    'Switched active organization for AuthJS session',
  );

  return createSuccessResponse({ success: true });
}
