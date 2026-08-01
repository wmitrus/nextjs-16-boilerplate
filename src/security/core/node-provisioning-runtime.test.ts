import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Container } from '@/core/container';
import { AUTH, INFRASTRUCTURE } from '@/core/contracts';

import { resolveNodeProvisioningAccess } from './node-provisioning-runtime';

import { mockEnv } from '@/testing';

const evaluateNodeProvisioningAccessMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    status: 'UNAUTHENTICATED',
    code: 'UNAUTHENTICATED',
    message: 'Authentication required.',
    diagnostics: {
      tenancyMode: 'single',
      userRecordExists: null,
      tenantRecordExists: null,
      membershipExists: null,
      onboardingStateExists: null,
      onboardingComplete: null,
      provisioningRequired: false,
      reason: 'unauthenticated',
    },
  }),
);

vi.mock('./node-provisioning-access', async () => {
  const actual = await vi.importActual('./node-provisioning-access');
  return {
    ...actual,
    evaluateNodeProvisioningAccess: evaluateNodeProvisioningAccessMock,
  };
});

function createContainer(dbRows: unknown[] = []) {
  const requestIdentitySource = {
    get: vi.fn().mockResolvedValue({
      userId: 'external-user-1',
      orgExternalId: 'external-org-1',
    }),
  };
  const identityProvider = { getCurrentIdentity: vi.fn() };
  const tenantResolver = { resolve: vi.fn() };
  const userRepository = { findById: vi.fn() };
  const db = {
    execute: vi.fn().mockResolvedValue({ rows: dbRows }),
  };

  const services = new Map<symbol, unknown>([
    [AUTH.IDENTITY_SOURCE, requestIdentitySource],
    [AUTH.IDENTITY_PROVIDER, identityProvider],
    [AUTH.TENANT_RESOLVER, tenantResolver],
    [AUTH.USER_REPOSITORY, userRepository],
    [INFRASTRUCTURE.DB, db],
  ]);

  return {
    container: {
      resolve: vi.fn((token: symbol) => services.get(token)),
    } as unknown as Container,
    db,
    identityProvider,
    requestIdentitySource,
    tenantResolver,
    userRepository,
  };
}

describe('resolveNodeProvisioningAccess', () => {
  beforeEach(() => {
    mockEnv.TENANCY_MODE = 'single';
    evaluateNodeProvisioningAccessMock.mockClear();
  });

  it('wires request identity and a tenant existence probe in single-tenant mode', async () => {
    const { container, db, identityProvider, requestIdentitySource } =
      createContainer([{ id: 'tenant-1' }]);

    await resolveNodeProvisioningAccess(container);

    expect(requestIdentitySource.get).toHaveBeenCalledTimes(1);
    expect(evaluateNodeProvisioningAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        identityProvider,
        tenancyMode: 'single',
        rawIdentity: {
          userId: 'external-user-1',
          orgExternalId: 'external-org-1',
        },
      }),
    );

    const deps = evaluateNodeProvisioningAccessMock.mock.calls[0]?.[0];
    await expect(deps.tenantExistsProbe('tenant-1')).resolves.toBe(true);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('returns false from the single-tenant probe when no tenant row exists', async () => {
    const { container } = createContainer([]);

    await resolveNodeProvisioningAccess(container);

    const deps = evaluateNodeProvisioningAccessMock.mock.calls[0]?.[0];
    await expect(deps.tenantExistsProbe('tenant-1')).resolves.toBe(false);
  });

  it('does not resolve the database outside single-tenant mode', async () => {
    mockEnv.TENANCY_MODE = 'org';
    const { container, db } = createContainer([{ id: 'tenant-1' }]);

    await resolveNodeProvisioningAccess(container);

    expect(evaluateNodeProvisioningAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenancyMode: 'org',
        tenantExistsProbe: undefined,
      }),
    );
    expect(db.execute).not.toHaveBeenCalled();
  });
});
