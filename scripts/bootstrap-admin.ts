/**
 * bootstrap-admin.ts
 *
 * Creates the first admin account for a fresh single-tenancy deployment.
 *
 * Problem this solves:
 *   REGISTRATION_MODE=invite-only + AUTH_PROVIDER=authjs creates a deadlock:
 *   no admin exists to send invites, but no one can register without an invite.
 *   This script breaks the deadlock by creating the admin account from env vars,
 *   bypassing the registration flow entirely.
 *
 * Industry equivalents:
 *   Ghost `ghost setup`, Gitea `admin user create --admin`,
 *   Discourse `rake admin:create`, Strapi `pnpm payload admin:create`
 *
 * Safety properties:
 *   - Idempotent: exits without changes when any user already exists in the DB
 *   - Race-safe: DB unique constraints prevent duplicate accounts
 *   - No wildcard access: ABAC policies are applied from the same ownerPolicies
 *     template used by the normal provisioning flow
 *   - Does NOT require REGISTRATION_MODE=open — the HTTP signup flow is bypassed
 *
 * Required env vars:
 *   BOOTSTRAP_ADMIN_EMAIL    — email address for the admin account
 *   BOOTSTRAP_ADMIN_PASSWORD — password (min 8 chars, use a strong secret in production)
 *   DEFAULT_TENANT_ID        — UUID for the single tenant (must match app config)
 *
 * Optional env vars:
 *   BOOTSTRAP_ORG_NAME       — display name for the organization (default: "Main Organization")
 *   DATABASE_URL             — postgres connection string (required for postgres driver)
 *   DB_DRIVER                — 'postgres' (default in production) | 'pglite' (dev only)
 *   DB_PROVIDER              — 'drizzle' (default)
 *
 * Usage:
 *   pnpm bootstrap:admin
 *
 * Against production DB locally (Vercel pattern — see docs/features/34):
 *   vercel env pull .env.vercel.local
 *   BOOTSTRAP_ADMIN_EMAIL=admin@company.com \
 *   BOOTSTRAP_ADMIN_PASSWORD=<secret> \
 *   node --env-file=.env.vercel.local node_modules/.bin/tsx scripts/bootstrap-admin.ts
 */
import './load-env';

import { randomUUID } from 'node:crypto';

import { hash } from 'bcryptjs';
import { count, eq } from 'drizzle-orm';

import { createDb } from '@/core/db/create-db';
import type { DbDriver, DbProvider } from '@/core/db/types';

import {
  authUserIdentitiesTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import {
  membershipsTable,
  organizationsTable,
  policiesTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import {
  memberPolicies,
  ownerPolicies,
  POLICY_TEMPLATE_VERSION,
} from '@/modules/provisioning/policy/templates';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

const BCRYPT_COST = 12;
const DEFAULT_PGLITE_URL = 'file:./data/pglite';

function resolveProvider(): DbProvider {
  const explicit = process.env.DB_PROVIDER?.trim();
  if (explicit === 'drizzle' || explicit === 'prisma') return explicit;
  return 'drizzle';
}

function resolveDriver(): DbDriver {
  const explicit = process.env.DB_DRIVER?.trim();
  if (explicit === 'postgres' || explicit === 'pglite') return explicit;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return nodeEnv === 'production' ? 'postgres' : 'pglite';
}

function resolveDatabaseUrl(
  driver: DbDriver,
  rawUrl: string | undefined,
  unpooledUrl: string | undefined,
): string | undefined {
  if (driver === 'postgres') {
    return (unpooledUrl?.trim() || rawUrl?.trim()) ?? undefined;
  }
  const trimmed = rawUrl?.trim();
  if (!trimmed) return DEFAULT_PGLITE_URL;
  if (trimmed.startsWith('file:') || trimmed.startsWith('pglite://'))
    return trimmed;
  return DEFAULT_PGLITE_URL;
}

export async function run(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  const tenantId = process.env.DEFAULT_TENANT_ID?.trim();
  const orgName = process.env.BOOTSTRAP_ORG_NAME?.trim() ?? 'Main Organization';

  if (!email) {
    console.error(
      '[bootstrap-admin] ❌  BOOTSTRAP_ADMIN_EMAIL is required but not set',
    );
    process.exit(1);
  }
  if (!password) {
    console.error(
      '[bootstrap-admin] ❌  BOOTSTRAP_ADMIN_PASSWORD is required but not set',
    );
    process.exit(1);
  }
  if (!tenantId) {
    console.error(
      '[bootstrap-admin] ❌  DEFAULT_TENANT_ID is required but not set',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error(
      '[bootstrap-admin] ❌  BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters',
    );
    process.exit(1);
  }

  const provider = resolveProvider();
  const driver = resolveDriver();
  const url = resolveDatabaseUrl(
    driver,
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
  );

  if (driver === 'postgres' && !url) {
    console.error(
      '[bootstrap-admin] ❌  DATABASE_URL is required for DB_DRIVER=postgres',
    );
    process.exit(1);
  }

  console.log('[bootstrap-admin] Connecting to database…');
  console.log(`  provider : ${provider}`);
  console.log(`  driver   : ${driver}`);
  console.log(`  target   : ${url ?? DEFAULT_PGLITE_URL}`);
  if (driver === 'postgres' && process.env.DATABASE_URL_UNPOOLED) {
    console.log('  conn     : direct (unpooled) — required for DDL');
  }

  const dbRuntime = createDb({ provider, driver, url });

  try {
    const [{ userCount }] = await dbRuntime.db
      .select({ userCount: count() })
      .from(usersTable);

    if (userCount > 0) {
      console.log(
        `[bootstrap-admin] ⏭  Skipped — ${userCount} user(s) already exist. Bootstrap only runs on a fresh database.`,
      );
      return;
    }

    console.log(`[bootstrap-admin] Creating admin account for: ${email}`);

    const hashedPassword = await hash(password, BCRYPT_COST);
    const userId = randomUUID();
    const orgId = randomUUID();
    const ownerRoleId = randomUUID();
    const memberRoleId = randomUUID();

    await dbRuntime.db.transaction(async (tx) => {
      await tx
        .insert(tenantsTable)
        .values({ id: tenantId, name: orgName })
        .onConflictDoNothing();

      await tx
        .insert(organizationsTable)
        .values({ id: orgId, tenantId, name: orgName })
        .onConflictDoNothing();

      await tx
        .insert(tenantAttributesTable)
        .values({
          tenantId,
          plan: 'standard',
          contractType: 'standard',
          features: [],
          maxUsers: 100,
          maxOrganizations: 1,
          policyTemplateVersion: 0,
        })
        .onConflictDoNothing();

      await tx
        .insert(usersTable)
        .values({ id: userId, email, onboardingComplete: true })
        .onConflictDoNothing();

      await tx
        .insert(userCredentialsTable)
        .values({ userId, email, hashedPassword, emailVerified: true })
        .onConflictDoNothing();

      await tx
        .insert(authUserIdentitiesTable)
        .values({ provider: 'authjs', externalUserId: userId, userId })
        .onConflictDoNothing();

      await tx
        .insert(rolesTable)
        .values([
          {
            id: ownerRoleId,
            organizationId: orgId,
            name: 'owner',
            isSystem: true,
          },
          {
            id: memberRoleId,
            organizationId: orgId,
            name: 'member',
            isSystem: true,
          },
        ])
        .onConflictDoNothing();

      for (const policy of ownerPolicies) {
        await tx
          .insert(policiesTable)
          .values({
            id: randomUUID(),
            organizationId: orgId,
            roleId: ownerRoleId,
            effect: policy.effect,
            resource: policy.resource,
            actions: policy.actions,
            conditions: policy.conditions ?? {},
          })
          .onConflictDoNothing();
      }

      for (const policy of memberPolicies) {
        await tx
          .insert(policiesTable)
          .values({
            id: randomUUID(),
            organizationId: orgId,
            roleId: memberRoleId,
            effect: policy.effect,
            resource: policy.resource,
            actions: policy.actions,
            conditions: policy.conditions ?? {},
          })
          .onConflictDoNothing();
      }

      await tx
        .update(tenantAttributesTable)
        .set({ policyTemplateVersion: POLICY_TEMPLATE_VERSION })
        .where(eq(tenantAttributesTable.tenantId, tenantId));

      await tx
        .insert(membershipsTable)
        .values({ userId, organizationId: orgId, roleId: ownerRoleId })
        .onConflictDoNothing();
    });

    console.log('');
    console.log('[bootstrap-admin] ✅  Bootstrap complete');
    console.log(`[bootstrap-admin]    Email    : ${email}`);
    console.log(
      '[bootstrap-admin]    Password : [set via BOOTSTRAP_ADMIN_PASSWORD]',
    );
    console.log(
      `[bootstrap-admin]    Org      : ${orgName} (tenant: ${tenantId})`,
    );
    console.log('[bootstrap-admin]    Role     : owner (full ABAC policies)');
    console.log('');
    console.log(
      '[bootstrap-admin] ⚠️   Sign in at /auth/signin and verify access at /admin.',
    );
    console.log(
      '[bootstrap-admin] ⚠️   After confirming access, remove BOOTSTRAP_ADMIN_PASSWORD from env.',
    );
  } finally {
    await dbRuntime.close?.();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/bootstrap-admin.ts');

if (isMain) {
  run().catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[bootstrap-admin] ❌  Fatal error:', error.message);
    const cause = (error as { cause?: unknown }).cause;
    const pg = (cause ?? err) as Record<string, unknown>;
    if (pg['code'])
      console.error('[bootstrap-admin]    PG code  :', pg['code']);
    if (pg['detail'])
      console.error('[bootstrap-admin]    PG detail:', pg['detail']);
    if (pg['hint'])
      console.error('[bootstrap-admin]    PG hint  :', pg['hint']);
    if (pg['column'])
      console.error('[bootstrap-admin]    PG column:', pg['column']);
    if (pg['constraint'])
      console.error('[bootstrap-admin]    PG constr:', pg['constraint']);
    if (pg['message'] && pg !== (err as Record<string, unknown>)) {
      console.error('[bootstrap-admin]    PG msg   :', pg['message']);
    }
    process.exit(1);
  });
}
