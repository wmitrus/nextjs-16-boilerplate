vi.mock('./load-env', () => ({}));

vi.mock('@/core/db/create-db', () => ({ createDb: vi.fn() }));
vi.mock('@/modules/authorization/infrastructure/drizzle/seed', () => ({
  seedAuthorization: vi.fn(),
}));
vi.mock('@/modules/billing/infrastructure/drizzle/seed', () => ({
  seedBilling: vi.fn(),
}));
vi.mock('@/modules/user/infrastructure/drizzle/seed', () => ({
  seedUsers: vi.fn(),
}));

import { resolveDatabaseUrl } from './db-seed';

describe('resolveDatabaseUrl', () => {
  it('uses the canonical PGlite path when no URL is provided', () => {
    expect(resolveDatabaseUrl('pglite', undefined)).toBe('file:./data/pglite');
  });

  it('preserves a custom file URL for PGlite', () => {
    expect(resolveDatabaseUrl('pglite', 'file:./data/custom')).toBe(
      'file:./data/custom',
    );
  });

  it('preserves a custom pglite URL for PGlite', () => {
    expect(resolveDatabaseUrl('pglite', 'pglite://./data/custom')).toBe(
      'pglite://./data/custom',
    );
  });

  it('ignores a postgres URL when the driver is PGlite', () => {
    expect(
      resolveDatabaseUrl('pglite', 'postgres://localhost:5432/app_dev'),
    ).toBe('file:./data/pglite');
  });

  it('preserves a postgres URL for the postgres driver', () => {
    expect(
      resolveDatabaseUrl('postgres', 'postgres://localhost:5432/app_dev'),
    ).toBe('postgres://localhost:5432/app_dev');
  });
});
