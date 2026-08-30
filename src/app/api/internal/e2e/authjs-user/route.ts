import { asc, eq, inArray, ne } from 'drizzle-orm';
import { connection } from 'next/server';
import { z } from 'zod';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';

import {
  CONTAINMENT_FIXTURE,
  findCanonicalOrganizationWithOwner,
  isLocalContainmentFixtureTarget,
  type ContainmentTopology,
  verifyContainmentTopology,
} from './containment-fixture';

import { hashPassword } from '@/modules/auth/infrastructure/credentials/password-hasher';
import { passwordSchema } from '@/modules/auth/infrastructure/credentials/password-policy';
import {
  authUserIdentitiesTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import {
  membershipsTable,
  organizationsTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

const requestSchema = z.object({
  email: z.email(),
  organizationContainmentFixture: z.boolean().default(false),
  password: passwordSchema,
  onboardingComplete: z.boolean().default(true),
});

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (!env.E2E_ENABLED || env.AUTH_PROVIDER !== 'authjs') {
    return createServerErrorResponse('Not found', 404);
  }

  const parsedBody = requestSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return createServerErrorResponse('Invalid request body', 400);
  }

  if (env.TENANCY_MODE !== 'single' || !env.DEFAULT_TENANT_ID) {
    return createServerErrorResponse(
      'AuthJS E2E provisioning requires single-tenant runtime.',
      409,
    );
  }
  const defaultTenantId = env.DEFAULT_TENANT_ID;

  const {
    email,
    password,
    onboardingComplete,
    organizationContainmentFixture,
  } = parsedBody.data;

  if (organizationContainmentFixture && !isLocalContainmentFixtureTarget()) {
    return createServerErrorResponse(
      'Containment fixture requires the local test database.',
      403,
    );
  }

  const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

  const organization = await findCanonicalOrganizationWithOwner(
    db,
    defaultTenantId,
  );

  if (!organization) {
    return createServerErrorResponse(
      'Default tenant organization is missing.',
      409,
    );
  }

  const role = { id: organization.ownerRoleId };

  const [outsideTenantOrganization] = organizationContainmentFixture
    ? await db
        .select({
          id: organizationsTable.id,
          tenantId: organizationsTable.tenantId,
        })
        .from(organizationsTable)
        .where(ne(organizationsTable.tenantId, defaultTenantId))
        .orderBy(asc(organizationsTable.id))
        .limit(1)
    : [];

  if (organizationContainmentFixture && !outsideTenantOrganization) {
    return createServerErrorResponse(
      'Containment fixture topology could not be verified.',
      409,
    );
  }

  const hashedPassword = await hashPassword(password);
  let containmentTopology: ContainmentTopology | undefined;

  await db.transaction(async (tx) => {
    if (organizationContainmentFixture) {
      await tx
        .insert(organizationsTable)
        .values({
          id: CONTAINMENT_FIXTURE.siblingOrganizationId,
          tenantId: defaultTenantId,
          name: 'AuthJS E2E Containment Sibling',
          slug: 'authjs-e2e-containment-sibling',
        })
        .onConflictDoNothing();

      const topologyOrganizations = await tx
        .select({
          id: organizationsTable.id,
          tenantId: organizationsTable.tenantId,
        })
        .from(organizationsTable)
        .where(
          inArray(organizationsTable.id, [
            organization.id,
            CONTAINMENT_FIXTURE.siblingOrganizationId,
            outsideTenantOrganization!.id,
          ]),
        )
        .orderBy(asc(organizationsTable.id));
      const verifiedTopology = verifyContainmentTopology(
        topologyOrganizations,
        defaultTenantId,
        organization.id,
        outsideTenantOrganization!.id,
      );

      if (!verifiedTopology) {
        throw new Error('Containment fixture topology could not be verified.');
      }
      containmentTopology = verifiedTopology;
    }

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

  if (organizationContainmentFixture && !containmentTopology) {
    return createServerErrorResponse(
      'Containment fixture topology could not be verified.',
      409,
    );
  }

  return createSuccessResponse(
    containmentTopology
      ? { ...containmentTopology, success: true }
      : { success: true },
    201,
  );
}
