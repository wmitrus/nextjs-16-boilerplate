import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/core/db/types';

vi.mock('server-only', () => ({}));

import {
  findCanonicalOrganizationWithOwner,
  isLocalContainmentFixtureTarget,
  verifyContainmentTopology,
} from './containment-fixture';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  db: {} as Record<string, unknown>,
  connection: vi.fn().mockResolvedValue(undefined),
  env: {
    AUTH_PROVIDER: 'authjs',
    DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5433/app_test',
    DB_DRIVER: 'postgres',
    DEFAULT_TENANT_ID: '10000000-0000-4000-8000-000000000001',
    E2E_ENABLED: false,
    TENANCY_MODE: 'single',
    VERCEL_ENV: undefined as 'preview' | 'production' | undefined,
  },
  hashPassword: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: mocks.connection };
});

vi.mock('@/core/env', () => ({ env: mocks.env }));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({ resolve: mocks.resolve }),
}));

vi.mock('@/modules/auth/infrastructure/credentials/password-hasher', () => ({
  hashPassword: mocks.hashPassword,
}));

function makeRequest(organizationContainmentFixture = false) {
  return new Request('http://localhost/api/internal/e2e/authjs-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'e2e@example.com',
      organizationContainmentFixture,
      password: 'E2E-Password-123!',
    }),
  });
}

describe('POST /api/internal/e2e/authjs-user', () => {
  beforeEach(() => {
    mocks.connection.mockClear();
    mocks.connection.mockResolvedValue(undefined);
    mocks.env.AUTH_PROVIDER = 'authjs';
    mocks.env.DATABASE_URL =
      'postgres://postgres:postgres@127.0.0.1:5433/app_test';
    mocks.env.DB_DRIVER = 'postgres';
    mocks.env.E2E_ENABLED = false;
    mocks.env.VERCEL_ENV = undefined;
    mocks.resolve.mockReset();
    mocks.hashPassword.mockReset();
  });

  it('is unavailable unless local E2E provisioning is explicitly enabled', async () => {
    const { POST } = await import('./route');

    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
    expect(mocks.connection).toHaveBeenCalledOnce();
  });

  it('is unavailable outside the AuthJS provider runtime', async () => {
    mocks.env.E2E_ENABLED = true;
    mocks.env.AUTH_PROVIDER = 'clerk';
    const { POST } = await import('./route');

    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
  });

  it('preserves the ordinary provisioning response contract', async () => {
    const canonicalQuery = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      limit: vi.fn().mockResolvedValue([
        {
          id: '15000000-0000-4000-8000-000000000001',
          ownerRoleId: '20000000-0000-4000-8000-000000000001',
        },
      ]),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    canonicalQuery.from.mockReturnValue(canonicalQuery);
    canonicalQuery.innerJoin.mockReturnValue(canonicalQuery);
    canonicalQuery.orderBy.mockReturnValue(canonicalQuery);
    canonicalQuery.where.mockReturnValue(canonicalQuery);
    const existingUserQuery = {
      from: vi.fn(),
      limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
      where: vi.fn(),
    };
    existingUserQuery.from.mockReturnValue(existingUserQuery);
    existingUserQuery.where.mockReturnValue(existingUserQuery);
    const mutation = {
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      values: vi.fn(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    mutation.set.mockReturnValue(mutation);
    mutation.values.mockReturnValue(mutation);
    const tx = {
      insert: vi.fn().mockReturnValue(mutation),
      select: vi.fn().mockReturnValue(existingUserQuery),
      update: vi.fn().mockReturnValue(mutation),
    };
    const db = {
      select: vi.fn().mockReturnValue(canonicalQuery),
      transaction: vi.fn(async (callback) => callback(tx)),
    };
    mocks.env.E2E_ENABLED = true;
    mocks.hashPassword.mockResolvedValue('hashed-password');
    mocks.resolve.mockReturnValue(db);
    const { POST } = await import('./route');

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ data: { success: true }, status: 'ok' });
  });

  it('refuses containment fixture mutation outside the local test database', async () => {
    mocks.env.E2E_ENABLED = true;
    mocks.env.DATABASE_URL = 'postgres://localhost:5432/app';
    const { POST } = await import('./route');

    const response = await POST(makeRequest(true));

    expect(response.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('proves the returned A1/A2/B1 topology', async () => {
    expect(
      verifyContainmentTopology(
        [
          {
            id: '15000000-0000-4000-8000-000000000001',
            tenantId: mocks.env.DEFAULT_TENANT_ID,
          },
          {
            id: '15000000-0000-4000-8000-000000000002',
            tenantId: '10000000-0000-4000-8000-000000000002',
          },
          {
            id: '15000000-0000-4000-8000-000000000003',
            tenantId: mocks.env.DEFAULT_TENANT_ID,
          },
        ],
        mocks.env.DEFAULT_TENANT_ID,
        '15000000-0000-4000-8000-000000000001',
        '15000000-0000-4000-8000-000000000002',
      ),
    ).toEqual({
      activeOrganizationId: '15000000-0000-4000-8000-000000000001',
      outsideTenantOrganizationId: '15000000-0000-4000-8000-000000000002',
      siblingOrganizationId: '15000000-0000-4000-8000-000000000003',
    });

    expect(
      verifyContainmentTopology(
        [
          {
            id: '15000000-0000-4000-8000-000000000001',
            tenantId: mocks.env.DEFAULT_TENANT_ID,
          },
          {
            id: '15000000-0000-4000-8000-000000000003',
            tenantId: mocks.env.DEFAULT_TENANT_ID,
          },
        ],
        mocks.env.DEFAULT_TENANT_ID,
        '15000000-0000-4000-8000-000000000001',
        '15000000-0000-4000-8000-000000000001',
      ),
    ).toBeNull();
  });

  it('selects the owner-backed A1 deterministically after A2 exists', async () => {
    const query = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      limit: vi.fn().mockResolvedValue([
        {
          id: '15000000-0000-4000-8000-000000000001',
          ownerRoleId: '20000000-0000-4000-8000-000000000001',
        },
      ]),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const db = {
      select: vi.fn().mockReturnValue(query),
    } as unknown as DrizzleDb;
    const organization = await findCanonicalOrganizationWithOwner(
      db,
      mocks.env.DEFAULT_TENANT_ID,
    );

    expect(organization).toEqual({
      id: '15000000-0000-4000-8000-000000000001',
      ownerRoleId: '20000000-0000-4000-8000-000000000001',
    });
    expect(query.innerJoin).toHaveBeenCalledOnce();
    expect(query.orderBy).toHaveBeenCalledOnce();
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it('accepts IPv6 loopback only for the local test database', () => {
    mocks.env.DATABASE_URL = 'postgres://postgres:postgres@[::1]:5433/app_test';

    expect(isLocalContainmentFixtureTarget()).toBe(true);
  });
});
