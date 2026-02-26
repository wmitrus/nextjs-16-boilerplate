/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { container } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { RoleRepository } from '@/core/contracts/repositories';
import type { TenantResolver } from '@/core/contracts/tenancy';

import { getSecurityContext } from './security-context';

import {
  mockNextHeaders,
  mockGetIP,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Security Context', () => {
  let identityProvider: IdentityProvider;
  let tenantResolver: TenantResolver;
  let roleRepository: RoleRepository;

  const getDependencies = () => ({
    identityProvider,
    tenantResolver,
    roleRepository,
  });

  beforeEach(() => {
    identityProvider = container.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    );
    tenantResolver = container.resolve<TenantResolver>(AUTH.TENANT_RESOLVER);
    roleRepository = container.resolve<RoleRepository>(
      AUTHORIZATION.ROLE_REPOSITORY,
    );
    resetAllInfrastructureMocks();
    vi.clearAllMocks();
  });

  it('should return guest context when not authenticated', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue(null);
    mockNextHeaders.mockReturnValue(new Headers());
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.ip).toBe('127.0.0.1');
    expect(context.correlationId).toBeDefined();
  });

  it('should return user context when authenticated as user', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      tenantId: 'tenant_123',
      userId: 'user_123',
    });
    vi.mocked(roleRepository.getRoles).mockResolvedValue(['user']);

    mockNextHeaders.mockReturnValue(
      new Headers({
        'user-agent': 'test-agent',
        'x-correlation-id': 'test-correlation',
        'x-forwarded-for': '1.1.1.1',
      }),
    );
    mockGetIP.mockResolvedValue('1.1.1.1');

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toEqual({
      id: 'user_123',
      role: 'user',
      tenantId: 'tenant_123',
    });
    expect(context.ip).toBe('1.1.1.1');
    expect(context.userAgent).toBe('test-agent');
    expect(context.correlationId).toBe('test-correlation');
  });

  it('should return admin context when authenticated as admin', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'admin_1',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      tenantId: 't1',
      userId: 'admin_1',
    });
    vi.mocked(roleRepository.getRoles).mockResolvedValue(['admin']);

    mockNextHeaders.mockReturnValue(new Headers());
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext(getDependencies());

    expect(context.user?.role).toBe('admin');
  });

  it('should use provided x-request-id if present', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue(null);
    mockNextHeaders.mockReturnValue(
      new Headers({
        'x-request-id': 'req_123',
      }),
    );
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext(getDependencies());

    expect(context.requestId).toBe('req_123');
  });
});
