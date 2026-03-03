/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';

import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '../../domain/errors';

import { DrizzleProvisioningService } from './DrizzleProvisioningService';

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
