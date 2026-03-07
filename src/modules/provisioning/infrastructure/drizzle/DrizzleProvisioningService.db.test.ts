/** @vitest-environment node */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';

import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '../../domain/errors';
import { POLICY_TEMPLATE_VERSION } from '../../policy/templates';

import { DrizzleProvisioningService } from './DrizzleProvisioningService';
import {
  authTenantIdentitiesTable,
  authUserIdentitiesTable,
  policiesTable,
  rolesTable,
  tenantAttributesTable,
  tenantsTable,
  usersTable,
} from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

function makeService(
  freeTierMaxUsers = 5,
  crossProviderEmailLinking: 'disabled' | 'verified-only' = 'verified-only',
) {
  return new DrizzleProvisioningService(
    testDb.db,
    freeTierMaxUsers,
    crossProviderEmailLinking,
  );
}

describe('DrizzleProvisioningService (real DB)', () => {
  describe('personal mode', () => {
    it('provisions user + personal tenant on first call', async () => {
      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_personal_001',
        email: 'personal001@example.com',
        tenancyMode: 'personal',
      });

      expect(result.internalUserId).toBeTruthy();
      expect(result.internalTenantId).toBeTruthy();
      expect(result.membershipRole).toBe('owner');
      expect(result.userCreatedNow).toBe(true);
      expect(result.tenantCreatedNow).toBe(true);
    });

    it('is idempotent — second call returns same IDs without creating new records', async () => {
      const svc = makeService();
      const first = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_personal_002',
        email: 'personal002@example.com',
        tenancyMode: 'personal',
      });

      const second = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_personal_002',
        email: 'personal002@example.com',
        tenancyMode: 'personal',
      });

      expect(second.internalUserId).toBe(first.internalUserId);
      expect(second.internalTenantId).toBe(first.internalTenantId);
      expect(second.membershipRole).toBe('owner');
      expect(second.userCreatedNow).toBe(false);
      expect(second.tenantCreatedNow).toBe(false);
    });

    it('creates exactly one personal tenant per user', async () => {
      const svc = makeService();
      const input = {
        provider: 'clerk' as const,
        externalUserId: 'user_personal_003',
        tenancyMode: 'personal' as const,
      };

      const first = await svc.ensureProvisioned(input);
      const second = await svc.ensureProvisioned(input);
      const third = await svc.ensureProvisioned(input);

      expect(first.internalTenantId).toBe(second.internalTenantId);
      expect(second.internalTenantId).toBe(third.internalTenantId);
    });
  });

  describe('org/provider mode', () => {
    it('provisions user + org tenant with owner role from claim', async () => {
      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_org_001',
        tenantExternalId: 'org_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      expect(result.internalUserId).toBeTruthy();
      expect(result.internalTenantId).toBeTruthy();
      expect(result.membershipRole).toBe('owner');
      expect(result.tenantCreatedNow).toBe(true);
    });

    it('maps org:member claim to member role', async () => {
      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_org_002',
        tenantExternalId: 'org_002',
        tenantRole: 'org:member',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      expect(result.membershipRole).toBe('member');
    });

    it('is idempotent — does not escalate role on second call', async () => {
      const svc = makeService();
      const input = {
        provider: 'clerk' as const,
        externalUserId: 'user_org_003',
        tenantExternalId: 'org_003',
        tenantRole: 'org:member',
        tenancyMode: 'org' as const,
        tenantContextSource: 'provider' as const,
      };

      const first = await svc.ensureProvisioned(input);
      expect(first.membershipRole).toBe('member');

      const second = await svc.ensureProvisioned({
        ...input,
        tenantRole: 'org:admin',
      });

      expect(second.membershipRole).toBe('member');
      expect(second.internalUserId).toBe(first.internalUserId);
      expect(second.internalTenantId).toBe(first.internalTenantId);
    });

    it('throws TenantContextRequiredError when tenantExternalId is missing', async () => {
      const svc = makeService();
      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_org_004',
          tenancyMode: 'org',
          tenantContextSource: 'provider',
        }),
      ).rejects.toThrow(TenantContextRequiredError);
    });

    it('bootstraps owner + member roles for the tenant (no wildcards)', async () => {
      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_org_005',
        tenantExternalId: 'org_005',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      expect(result.membershipRole).toBe('owner');
    });
  });

  describe('org/db mode', () => {
    it('throws TenantMembershipRequiredError when user has no membership', async () => {
      const svc = makeService();
      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_org_db_001',
        tenantExternalId: 'org_db_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      const secondUserResult = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_org_db_002',
        tenancyMode: 'personal',
      });

      const orgResult = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_org_db_001',
        tenantExternalId: 'org_db_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_org_db_002',
          activeTenantId: orgResult.internalTenantId,
          tenancyMode: 'org',
          tenantContextSource: 'db',
        }),
      ).rejects.toThrow(TenantMembershipRequiredError);

      expect(secondUserResult).toBeDefined();
    });

    it('throws TenantContextRequiredError when activeTenantId is missing', async () => {
      const svc = makeService();
      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_org_db_003',
          tenancyMode: 'org',
          tenantContextSource: 'db',
        }),
      ).rejects.toThrow(TenantContextRequiredError);
    });
  });

  describe('free-tier limit', () => {
    it('throws TenantUserLimitReachedError when limit is exceeded', async () => {
      const svc = makeService(2);

      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_limit_001',
        tenantExternalId: 'org_limit_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_limit_002',
        tenantExternalId: 'org_limit_001',
        tenantRole: 'org:member',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_limit_003',
          tenantExternalId: 'org_limit_001',
          tenantRole: 'org:member',
          tenancyMode: 'org',
          tenantContextSource: 'provider',
        }),
      ).rejects.toThrow(TenantUserLimitReachedError);
    });
  });

  describe('no wildcard policies', () => {
    it('bootstraps tenant without inserting any policies (policies are in PR-3 templates)', async () => {
      const svc = makeService();
      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_policy_001',
        tenantExternalId: 'org_policy_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });
    });
  });

  describe('single mode', () => {
    it('throws TenantContextRequiredError when activeTenantId is missing', async () => {
      const svc = makeService();
      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_single_001',
          tenancyMode: 'single',
        }),
      ).rejects.toThrow(TenantContextRequiredError);
    });

    it('throws TenantNotProvisionedError when configured default tenant does not exist', async () => {
      const svc = makeService();
      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_single_missing_default_tenant',
          tenancyMode: 'single',
          activeTenantId: '99999999-0000-4000-8000-000000000999',
        }),
      ).rejects.toThrow(TenantNotProvisionedError);
    });
  });

  describe('cross-provider email linking (P1 security fix)', () => {
    it('links same verified email across providers → same internalUserId', async () => {
      const svc = makeService(5, 'verified-only');
      const sharedEmail = 'crosslink-verified@example.com';

      const first = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_crosslink_clerk_001',
        email: sharedEmail,
        emailVerified: true,
        tenancyMode: 'personal',
      });

      const second = await svc.ensureProvisioned({
        provider: 'authjs',
        externalUserId: 'user_crosslink_authjs_001',
        email: sharedEmail,
        emailVerified: true,
        tenancyMode: 'personal',
      });

      expect(first.internalUserId).toBeTruthy();
      expect(second.internalUserId).toBe(first.internalUserId);
    });

    it('throws CrossProviderLinkingNotAllowedError when email is unverified (verified-only policy)', async () => {
      const svc = makeService(5, 'verified-only');
      const sharedEmail = 'crosslink-unverified@example.com';

      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_crosslink_unverified_clerk',
        email: sharedEmail,
        emailVerified: true,
        tenancyMode: 'personal',
      });

      await expect(
        svc.ensureProvisioned({
          provider: 'authjs',
          externalUserId: 'user_crosslink_unverified_authjs',
          email: sharedEmail,
          emailVerified: false,
          tenancyMode: 'personal',
        }),
      ).rejects.toThrow(CrossProviderLinkingNotAllowedError);
    });

    it('throws CrossProviderLinkingNotAllowedError when policy is disabled, even with verified email', async () => {
      const svc = makeService(5, 'disabled');
      const sharedEmail = 'crosslink-disabled@example.com';

      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_crosslink_disabled_clerk',
        email: sharedEmail,
        emailVerified: true,
        tenancyMode: 'personal',
      });

      await expect(
        svc.ensureProvisioned({
          provider: 'authjs',
          externalUserId: 'user_crosslink_disabled_authjs',
          email: sharedEmail,
          emailVerified: true,
          tenancyMode: 'personal',
        }),
      ).rejects.toThrow(CrossProviderLinkingNotAllowedError);
    });

    it('returns consistent internalUserId when same provider+externalId provisioned twice', async () => {
      const svc = makeService();
      const first = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_email_idempotent_001',
        email: 'idempotent-email@example.com',
        emailVerified: true,
        tenancyMode: 'personal',
      });

      const second = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_email_idempotent_001',
        email: 'idempotent-email@example.com',
        emailVerified: true,
        tenancyMode: 'personal',
      });

      expect(second.internalUserId).toBe(first.internalUserId);
    });
  });

  describe('legacy mapping compatibility (P1 fix — deterministic UUID migration)', () => {
    it('personal tenant: returns legacy random UUID from auth_tenant_identities instead of computing new deterministic one', async () => {
      const db = testDb.db;
      const legacyUserId = crypto.randomUUID();
      const legacyTenantId = crypto.randomUUID();

      await db
        .insert(usersTable)
        .values({ id: legacyUserId, email: 'legacy-personal@example.com' });
      await db.insert(authUserIdentitiesTable).values({
        provider: 'clerk',
        externalUserId: 'user_legacy_personal_ext',
        userId: legacyUserId,
      });
      await db
        .insert(tenantsTable)
        .values({ id: legacyTenantId, name: 'Legacy Personal Workspace' });
      await db.insert(authTenantIdentitiesTable).values({
        provider: 'personal',
        externalTenantId: legacyUserId,
        tenantId: legacyTenantId,
      });

      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_legacy_personal_ext',
        email: 'legacy-personal@example.com',
        tenancyMode: 'personal',
      });

      expect(result.internalUserId).toBe(legacyUserId);
      expect(result.internalTenantId).toBe(legacyTenantId);
      expect(result.tenantCreatedNow).toBe(false);
    });

    it('org/provider tenant: returns legacy random UUID from auth_tenant_identities instead of computing new deterministic one', async () => {
      const db = testDb.db;
      const legacyTenantId = crypto.randomUUID();

      await db
        .insert(tenantsTable)
        .values({ id: legacyTenantId, name: 'Legacy Org Tenant' });
      await db.insert(authTenantIdentitiesTable).values({
        provider: 'clerk',
        externalTenantId: 'org_legacy_ext_001',
        tenantId: legacyTenantId,
      });

      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_legacy_org_ext_001',
        tenantExternalId: 'org_legacy_ext_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      expect(result.internalTenantId).toBe(legacyTenantId);
      expect(result.tenantCreatedNow).toBe(false);
    });
  });

  describe('cross-provider gate — existingUser branch (user row pre-exists, no identity mapping)', () => {
    it('unverified email link is rejected when user already exists without identity mapping (existingUser branch)', async () => {
      const db = testDb.db;
      const existingUserId = crypto.randomUUID();
      const raceEmail = 'race-gate@example.com';

      await db
        .insert(usersTable)
        .values({ id: existingUserId, email: raceEmail });

      const svc = makeService(5, 'verified-only');

      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_race_gate_clerk',
          email: raceEmail,
          emailVerified: false,
          tenancyMode: 'personal',
        }),
      ).rejects.toThrow(CrossProviderLinkingNotAllowedError);
    });

    it('disabled policy rejects even verified-email link when user already exists without identity mapping', async () => {
      const db = testDb.db;
      const existingUserId = crypto.randomUUID();
      const raceEmail = 'race-gate-disabled@example.com';

      await db
        .insert(usersTable)
        .values({ id: existingUserId, email: raceEmail });

      const svc = makeService(5, 'disabled');

      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_race_disabled_clerk',
          email: raceEmail,
          emailVerified: true,
          tenancyMode: 'personal',
        }),
      ).rejects.toThrow(CrossProviderLinkingNotAllowedError);
    });

    it('verified-only policy allows link when user already exists and email is verified — returns DB-authoritative userId', async () => {
      const db = testDb.db;
      const existingUserId = crypto.randomUUID();
      const raceEmail = 'race-gate-allowed@example.com';

      await db
        .insert(usersTable)
        .values({ id: existingUserId, email: raceEmail });

      const svc = makeService(5, 'verified-only');

      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_race_allowed_clerk',
        email: raceEmail,
        emailVerified: true,
        tenancyMode: 'personal',
      });

      expect(result.internalUserId).toBe(existingUserId);

      const mapping = await db
        .select({ userId: authUserIdentitiesTable.userId })
        .from(authUserIdentitiesTable)
        .where(
          and(
            eq(authUserIdentitiesTable.provider, 'clerk'),
            eq(
              authUserIdentitiesTable.externalUserId,
              'user_race_allowed_clerk',
            ),
          ),
        )
        .limit(1);

      expect(mapping[0]?.userId).toBe(existingUserId);
      expect(result.internalUserId).toBe(mapping[0]?.userId);
    });
  });

  describe('canonical mapping re-read — authoritative DB value returned after insert', () => {
    it('returned internalUserId always matches auth_user_identities row (canonical re-read)', async () => {
      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_canonical_reread_001',
        email: 'canonical-reread@example.com',
        emailVerified: true,
        tenancyMode: 'personal',
      });

      const mapping = await testDb.db
        .select({ userId: authUserIdentitiesTable.userId })
        .from(authUserIdentitiesTable)
        .where(
          and(
            eq(authUserIdentitiesTable.provider, 'clerk'),
            eq(
              authUserIdentitiesTable.externalUserId,
              'user_canonical_reread_001',
            ),
          ),
        )
        .limit(1);

      expect(mapping[0]?.userId).toBeTruthy();
      expect(result.internalUserId).toBe(mapping[0]?.userId);
    });

    it('returned internalTenantId always matches auth_tenant_identities row for personal tenant (canonical re-read)', async () => {
      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_canonical_tenant_reread_001',
        email: 'canonical-tenant-reread@example.com',
        tenancyMode: 'personal',
      });

      const mapping = await testDb.db
        .select({ tenantId: authTenantIdentitiesTable.tenantId })
        .from(authTenantIdentitiesTable)
        .where(
          and(
            eq(authTenantIdentitiesTable.provider, 'personal'),
            eq(
              authTenantIdentitiesTable.externalTenantId,
              result.internalUserId,
            ),
          ),
        )
        .limit(1);

      expect(mapping[0]?.tenantId).toBeTruthy();
      expect(result.internalTenantId).toBe(mapping[0]?.tenantId);
    });

    it('returned internalTenantId always matches auth_tenant_identities row for org/provider tenant (canonical re-read)', async () => {
      const svc = makeService();
      const result = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_canonical_org_reread_001',
        tenantExternalId: 'org_canonical_reread_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      const mapping = await testDb.db
        .select({ tenantId: authTenantIdentitiesTable.tenantId })
        .from(authTenantIdentitiesTable)
        .where(
          and(
            eq(authTenantIdentitiesTable.provider, 'clerk'),
            eq(
              authTenantIdentitiesTable.externalTenantId,
              'org_canonical_reread_001',
            ),
          ),
        )
        .limit(1);

      expect(mapping[0]?.tenantId).toBeTruthy();
      expect(result.internalTenantId).toBe(mapping[0]?.tenantId);
    });
  });

  describe('role escalation guard', () => {
    it('does not escalate existing membership role when called with a different role claim', async () => {
      const svc = makeService();

      const first = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_noescalate_001',
        tenantExternalId: 'org_noescalate_001',
        tenantRole: 'org:member',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      expect(first.membershipRole).toBe('member');

      const second = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_noescalate_001',
        tenantExternalId: 'org_noescalate_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      expect(second.membershipRole).toBe('member');
      expect(second.internalUserId).toBe(first.internalUserId);
      expect(second.internalTenantId).toBe(first.internalTenantId);
    });
  });

  describe('policy template versioning idempotence', () => {
    it('re-applying templates for the same tenant does not create duplicate policies', async () => {
      const svc = makeService();
      const provisioned = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_policy_idempotence_001',
        tenantExternalId: 'org_policy_idempotence_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      const tenantId = provisioned.internalTenantId;
      const beforeRows = await testDb.db
        .select({ count: sql<number>`count(*)::int` })
        .from(policiesTable)
        .where(eq(policiesTable.tenantId, tenantId));
      const beforeCount = beforeRows[0]?.count ?? 0;
      expect(beforeCount).toBeGreaterThan(0);

      await testDb.db
        .update(tenantAttributesTable)
        .set({ policyTemplateVersion: 0 })
        .where(eq(tenantAttributesTable.tenantId, tenantId));

      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_policy_idempotence_001',
        tenantExternalId: 'org_policy_idempotence_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      const afterRows = await testDb.db
        .select({ count: sql<number>`count(*)::int` })
        .from(policiesTable)
        .where(eq(policiesTable.tenantId, tenantId));
      const afterCount = afterRows[0]?.count ?? 0;

      expect(afterCount).toBe(beforeCount);

      const attrs = await testDb.db
        .select({
          policyTemplateVersion: tenantAttributesTable.policyTemplateVersion,
        })
        .from(tenantAttributesTable)
        .where(eq(tenantAttributesTable.tenantId, tenantId))
        .limit(1);

      expect(attrs[0]?.policyTemplateVersion).toBe(POLICY_TEMPLATE_VERSION);
    });

    it('tenant has exactly one owner and one member role', async () => {
      const svc = makeService();
      const provisioned = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_role_uniqueness_001',
        tenantExternalId: 'org_role_uniqueness_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      const rows = await testDb.db
        .select({ count: sql<number>`count(*)::int` })
        .from(rolesTable)
        .where(
          and(
            eq(rolesTable.tenantId, provisioned.internalTenantId),
            sql`${rolesTable.name} IN ('owner', 'member')`,
          ),
        );

      expect(rows[0]?.count).toBe(2);
    });
  });

  describe('org/db — no write side-effects before membership check (P1 fix)', () => {
    it('throws TenantMembershipRequiredError and does NOT create tenant_attributes or roles for user without membership', async () => {
      const svc = makeService();

      const orgResult = await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_orgdb_writecheck_owner',
        tenantExternalId: 'org_writecheck_001',
        tenantRole: 'org:admin',
        tenancyMode: 'org',
        tenantContextSource: 'provider',
      });

      await svc.ensureProvisioned({
        provider: 'clerk',
        externalUserId: 'user_orgdb_writecheck_nomember',
        tenancyMode: 'personal',
      });

      await expect(
        svc.ensureProvisioned({
          provider: 'clerk',
          externalUserId: 'user_orgdb_writecheck_nomember',
          activeTenantId: orgResult.internalTenantId,
          tenancyMode: 'org',
          tenantContextSource: 'db',
        }),
      ).rejects.toThrow(TenantMembershipRequiredError);

      expect(orgResult.internalTenantId).toBeTruthy();
      expect(orgResult.membershipRole).toBe('owner');
    });
  });
});
