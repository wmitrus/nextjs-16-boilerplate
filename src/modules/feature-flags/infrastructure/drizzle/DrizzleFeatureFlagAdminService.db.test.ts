/** @vitest-environment node */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  DuplicateFeatureFlagError,
  FeatureFlagNotFoundError,
} from '../../domain/errors';

import { DrizzleFeatureFlagAdminService } from './DrizzleFeatureFlagAdminService';
import { featureFlagsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleFeatureFlagAdminService;

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleFeatureFlagAdminService(testDb.db);
});

afterEach(async () => {
  await testDb.db.delete(featureFlagsTable);
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleFeatureFlagAdminService (real DB)', () => {
  it('lists all rows, global and tenant-scoped, ordered by key then tenantId', async () => {
    await svc.create({ key: 'beta', tenantId: null, enabled: true });
    await svc.create({ key: 'alpha', tenantId: null, enabled: false });
    await svc.create({ key: 'alpha', tenantId: 'acme', enabled: true });

    const flags = await svc.listAll();

    // Postgres sorts NULL last in ascending order by default, so a
    // tenant-scoped row (real string tenantId) sorts before the global
    // (NULL tenantId) row for the same key.
    expect(flags).toHaveLength(3);
    expect(flags.map((f) => [f.key, f.tenantId])).toEqual([
      ['alpha', 'acme'],
      ['alpha', null],
      ['beta', null],
    ]);
  });

  it('creates a global flag', async () => {
    const created = await svc.create({
      key: 'new-flag',
      tenantId: null,
      enabled: true,
      description: 'a test flag',
    });

    expect(created).toMatchObject({
      key: 'new-flag',
      tenantId: null,
      enabled: true,
      description: 'a test flag',
    });
    expect(created.id).toEqual(expect.any(String));
  });

  it('creates a tenant-scoped flag with the same key as an existing global flag', async () => {
    await svc.create({ key: 'shared-key', tenantId: null, enabled: true });

    const scoped = await svc.create({
      key: 'shared-key',
      tenantId: 'acme',
      enabled: false,
    });

    expect(scoped.tenantId).toBe('acme');
    expect(await svc.listAll()).toHaveLength(2);
  });

  it('rejects a duplicate (key, tenantId) pair with a typed error', async () => {
    await svc.create({ key: 'dup', tenantId: 'acme', enabled: true });

    await expect(
      svc.create({ key: 'dup', tenantId: 'acme', enabled: false }),
    ).rejects.toThrow(DuplicateFeatureFlagError);
  });

  it('rejects a duplicate global (key, null tenantId) pair', async () => {
    await svc.create({ key: 'dup-global', tenantId: null, enabled: true });

    await expect(
      svc.create({ key: 'dup-global', tenantId: null, enabled: false }),
    ).rejects.toThrow(DuplicateFeatureFlagError);
  });

  it('updates enabled and description independently (unscoped / platform admin)', async () => {
    const created = await svc.create({
      key: 'togglable',
      tenantId: null,
      enabled: false,
      description: 'original',
    });

    const toggled = await svc.update(created.id, { enabled: true }, null);
    expect(toggled.enabled).toBe(true);
    expect(toggled.description).toBe('original');

    const described = await svc.update(
      created.id,
      { description: 'updated' },
      null,
    );
    expect(described.enabled).toBe(true);
    expect(described.description).toBe('updated');
  });

  it('throws FeatureFlagNotFoundError when updating a nonexistent id', async () => {
    await expect(
      svc.update(
        '00000000-0000-4000-8000-000000000000',
        { enabled: true },
        null,
      ),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  it('deletes a flag (unscoped / platform admin)', async () => {
    const created = await svc.create({
      key: 'deletable',
      tenantId: null,
      enabled: true,
    });

    await svc.delete(created.id, null);

    expect(await svc.listAll()).toHaveLength(0);
  });

  it('throws FeatureFlagNotFoundError when deleting a nonexistent id', async () => {
    await expect(
      svc.delete('00000000-0000-4000-8000-000000000000', null),
    ).rejects.toThrow(FeatureFlagNotFoundError);
  });

  describe('tenant scoping (SEC-26 regression coverage)', () => {
    it('listForTenant returns global rows plus only the given tenant’s own rows', async () => {
      await svc.create({ key: 'global-flag', tenantId: null, enabled: true });
      await svc.create({ key: 'acme-flag', tenantId: 'acme', enabled: true });
      await svc.create({
        key: 'globex-flag',
        tenantId: 'globex',
        enabled: true,
      });

      const acmeView = await svc.listForTenant('acme');

      expect(acmeView.map((f) => [f.key, f.tenantId]).sort()).toEqual(
        [
          ['global-flag', null],
          ['acme-flag', 'acme'],
        ].sort(),
      );
      expect(acmeView.some((f) => f.tenantId === 'globex')).toBe(false);
    });

    it('rejects updating another tenant’s row when scoped to a different tenant', async () => {
      const created = await svc.create({
        key: 'scoped-update',
        tenantId: 'acme',
        enabled: false,
      });

      await expect(
        svc.update(created.id, { enabled: true }, { tenantId: 'globex' }),
      ).rejects.toThrow(FeatureFlagNotFoundError);
    });

    it('rejects updating a global row when scoped to any tenant', async () => {
      const created = await svc.create({
        key: 'scoped-update-global',
        tenantId: null,
        enabled: false,
      });

      await expect(
        svc.update(created.id, { enabled: true }, { tenantId: 'acme' }),
      ).rejects.toThrow(FeatureFlagNotFoundError);
    });

    it('allows updating a row scoped to the caller’s own tenant', async () => {
      const created = await svc.create({
        key: 'scoped-update-own',
        tenantId: 'acme',
        enabled: false,
      });

      const updated = await svc.update(
        created.id,
        { enabled: true },
        { tenantId: 'acme' },
      );
      expect(updated.enabled).toBe(true);
    });

    it('rejects deleting another tenant’s row when scoped to a different tenant', async () => {
      const created = await svc.create({
        key: 'scoped-delete',
        tenantId: 'acme',
        enabled: false,
      });

      await expect(
        svc.delete(created.id, { tenantId: 'globex' }),
      ).rejects.toThrow(FeatureFlagNotFoundError);

      // The row must still exist -- the rejected delete must not have run.
      expect(await svc.listForTenant('acme')).toHaveLength(1);
    });

    it('allows deleting a row scoped to the caller’s own tenant', async () => {
      const created = await svc.create({
        key: 'scoped-delete-own',
        tenantId: 'acme',
        enabled: false,
      });

      await svc.delete(created.id, { tenantId: 'acme' });

      expect(await svc.listForTenant('acme')).toHaveLength(0);
    });
  });
});
