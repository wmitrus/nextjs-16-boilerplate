import { hash } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  authUserIdentitiesTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import {
  membershipsTable,
  organizationsTable,
  rolesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

const requestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  onboardingComplete: z.boolean().default(true),
});

const BCRYPT_COST = 12;

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (!env.E2E_ENABLED || env.AUTH_PROVIDER !== 'authjs') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const parsedBody = requestSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (env.TENANCY_MODE !== 'single' || !env.DEFAULT_TENANT_ID) {
    return Response.json(
      { error: 'AuthJS E2E provisioning requires single-tenant runtime.' },
      { status: 409 },
    );
  }

  const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const { email, password, onboardingComplete } = parsedBody.data;

  const [organization] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.tenantId, env.DEFAULT_TENANT_ID))
    .limit(1);

  if (!organization) {
    return Response.json(
      { error: 'Default tenant organization is missing.' },
      { status: 409 },
    );
  }

  const [role] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(
      and(
        eq(rolesTable.organizationId, organization.id),
        eq(rolesTable.name, 'owner'),
      ),
    )
    .limit(1);

  if (!role) {
    return Response.json(
      { error: 'Default tenant owner role is missing.' },
      { status: 409 },
    );
  }

  const hashedPassword = await hash(password, BCRYPT_COST);

  await db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    const userId = existingUser?.id ?? crypto.randomUUID();

    if (!existingUser) {
      await tx.insert(usersTable).values({
        id: userId,
        email,
        onboardingComplete,
        displayName: 'AuthJS E2E User',
      });
    } else {
      await tx
        .update(usersTable)
        .set({
          onboardingComplete,
          displayName: 'AuthJS E2E User',
          deactivatedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));
    }

    await tx
      .insert(userCredentialsTable)
      .values({
        userId,
        email,
        hashedPassword,
        emailVerified: true,
      })
      .onConflictDoUpdate({
        target: userCredentialsTable.userId,
        set: {
          email,
          hashedPassword,
          emailVerified: true,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(authUserIdentitiesTable)
      .values({
        provider: 'authjs',
        externalUserId: email,
        userId,
      })
      .onConflictDoNothing();

    await tx
      .insert(membershipsTable)
      .values({
        userId,
        organizationId: organization.id,
        roleId: role.id,
      })
      .onConflictDoNothing();
  });

  return Response.json({ success: true }, { status: 201 });
}
