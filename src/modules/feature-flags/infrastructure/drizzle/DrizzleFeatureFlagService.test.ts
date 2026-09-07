import { describe, expect, it, vi } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { FeatureFlagEvaluationContext } from '@/core/contracts/feature-flags';
import type { DrizzleDb } from '@/core/db';

import { DrizzleFeatureFlagService } from './DrizzleFeatureFlagService';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const TENANT_A = '22222222-2222-2222-2222-222222222222';

const orgCtx: FeatureFlagEvaluationContext = {
  scope: {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(ORG_A),
    tenantId: parentTenantIdFromOrgRow(TENANT_A),
  },
  subject: { kind: 'system', systemSubjectId: 'test' },
};

const platformCtx: FeatureFlagEvaluationContext = {
  scope: { kind: 'platform-global' },
  subject: { kind: 'system', systemSubjectId: 'test' },
};

function makeDb(rows: unknown[]) {
  return {
    execute: vi.fn().mockResolvedValue(rows),
  } as unknown as DrizzleDb;
}

describe('DrizzleFeatureFlagService', () => {
  describe('organization scope', () => {
    it('returns false when no row matches (missing flag or invalid tuple)', async () => {
      const svc = new DrizzleFeatureFlagService(makeDb([]));
      expect(await svc.isEnabled('some-flag', orgCtx)).toBe(false);
    });

    it('returns the row enabled value when a row matches', async () => {
      const svc = new DrizzleFeatureFlagService(makeDb([{ enabled: true }]));
      expect(await svc.isEnabled('some-flag', orgCtx)).toBe(true);
    });

    it('returns false when the matching row is disabled', async () => {
      const svc = new DrizzleFeatureFlagService(makeDb([{ enabled: false }]));
      expect(await svc.isEnabled('some-flag', orgCtx)).toBe(false);
    });

    it('issues exactly one query (one SQL authority boundary)', async () => {
      const db = makeDb([{ enabled: true }]);
      const svc = new DrizzleFeatureFlagService(db);

      await svc.isEnabled('some-flag', orgCtx);

      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('normalizes a `{ rows: [...] }`-shaped driver result the same as a bare array', async () => {
      const db = {
        execute: vi.fn().mockResolvedValue({ rows: [{ enabled: true }] }),
      } as unknown as DrizzleDb;
      const svc = new DrizzleFeatureFlagService(db);

      expect(await svc.isEnabled('some-flag', orgCtx)).toBe(true);
    });
  });

  describe('platform-global scope', () => {
    it('returns false when no row matches', async () => {
      const svc = new DrizzleFeatureFlagService(makeDb([]));
      expect(await svc.isEnabled('some-flag', platformCtx)).toBe(false);
    });

    it('returns the row enabled value when a row matches', async () => {
      const svc = new DrizzleFeatureFlagService(makeDb([{ enabled: true }]));
      expect(await svc.isEnabled('some-flag', platformCtx)).toBe(true);
    });
  });
});
