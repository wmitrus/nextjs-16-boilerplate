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
    return Response.json({ error: 'Not available' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid organization ID' }, { status: 422 });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
      return Response.json(
        { error: 'Organization membership required' },
        { status: 403 },
      );
    }

    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const organizationRows = await db
      .select({ status: organizationsTable.status })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, parsed.data.organizationId))
      .limit(1);

    if (organizationRows[0]?.status === 'archived') {
      return Response.json(
        { error: 'Archived organizations cannot be set as active' },
        { status: 409 },
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
    return Response.json(
      { error: 'Unable to switch organization' },
      { status: 500 },
    );
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

  return Response.json({ success: true });
}
