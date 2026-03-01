import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from './create-db';
import type { DrizzleDb } from './types';

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
      kind: 'pglite',
    } as unknown as DrizzleDb);
    createPostgresMock.mockReturnValue({
      kind: 'postgres',
    } as unknown as DrizzleDb);
  });

  it('creates drizzle+pglite db', () => {
    const db = createDb({
      provider: 'drizzle',
      driver: 'pglite',
      url: 'file:./data/pglite',
    });

    expect(createPgliteMock).toHaveBeenCalledWith('file:./data/pglite');
    expect(createPostgresMock).not.toHaveBeenCalled();
    expect(db).toEqual({ kind: 'pglite' });
  });

  it('creates drizzle+postgres db', () => {
    const url = 'postgres://localhost:5432/app';
    const db = createDb({ provider: 'drizzle', driver: 'postgres', url });

    expect(createPostgresMock).toHaveBeenCalledWith(url);
    expect(createPgliteMock).not.toHaveBeenCalled();
    expect(db).toEqual({ kind: 'postgres' });
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
