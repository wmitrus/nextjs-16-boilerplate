import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from './create-db';
import type { DbRuntime, DrizzleDb } from './types';

const createPgliteMock = vi.hoisted(() => vi.fn());
const createPostgresMock = vi.hoisted(() => vi.fn());

vi.mock('./drivers/create-pglite', () => ({
  createPglite: createPgliteMock,
}));

vi.mock('./drivers/create-postgres', () => ({
  createPostgres: createPostgresMock,
}));

describe('createDb', () => {
  beforeEach(() => {
    createPgliteMock.mockReset();
    createPostgresMock.mockReset();

    createPgliteMock.mockReturnValue({
      db: { kind: 'pglite' } as unknown as DrizzleDb,
      close: vi.fn(),
    } as DbRuntime);
    createPostgresMock.mockReturnValue({
      db: { kind: 'postgres' } as unknown as DrizzleDb,
      close: vi.fn(),
    } as DbRuntime);
  });

  it('creates drizzle+pglite db', () => {
    const db = createDb({
      provider: 'drizzle',
      driver: 'pglite',
      url: 'file:./data/pglite',
    });

    expect(createPgliteMock).toHaveBeenCalledWith('file:./data/pglite');
    expect(createPostgresMock).not.toHaveBeenCalled();
    expect(db.db).toEqual({ kind: 'pglite' });
    expect(db.close).toBeTypeOf('function');
  });

  it('creates drizzle+postgres db', () => {
    const url = 'postgres://localhost:5432/app';
    const db = createDb({ provider: 'drizzle', driver: 'postgres', url });

    expect(createPostgresMock).toHaveBeenCalledWith(url);
    expect(createPgliteMock).not.toHaveBeenCalled();
    expect(db.db).toEqual({ kind: 'postgres' });
    expect(db.close).toBeTypeOf('function');
  });

  it('throws when drizzle+postgres has no url', () => {
    expect(() => createDb({ provider: 'drizzle', driver: 'postgres' })).toThrow(
      'DATABASE_URL is required for postgres driver',
    );
  });

  it('throws clear error for unimplemented prisma provider', () => {
    expect(() =>
      createDb({ provider: 'prisma', driver: 'postgres', url: 'postgres://x' }),
    ).toThrow(
      'DB_PROVIDER=prisma is configured, but Prisma provider is not implemented yet.',
    );
  });
});
