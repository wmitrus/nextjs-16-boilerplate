import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getSecurityContext } from './security-context';

import {
  mockNextHeaders,
  mockGetIP,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Security Context', () => {
  let identityProvider: IdentityProvider;
  let tenantResolver: TenantResolver;

  const getDependencies = () => ({
    identityProvider,
    tenantResolver,
  });

  beforeEach(() => {
    const container = getAppContainer();

    identityProvider = container.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    );
    tenantResolver = container.resolve<TenantResolver>(AUTH.TENANT_RESOLVER);
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

  it('should return user context when authenticated', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      tenantId: 'tenant_123',
      userId: 'user_123',
    });

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
      tenantId: 'tenant_123',
    });
    expect(context.ip).toBe('1.1.1.1');
    expect(context.userAgent).toBe('test-agent');
    expect(context.correlationId).toBe('test-correlation');
  });

  it('should return user context with correct tenantId', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'admin_1',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      tenantId: 't1',
      userId: 'admin_1',
    });

    mockNextHeaders.mockReturnValue(new Headers());
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext(getDependencies());

    expect(context.user?.id).toBe('admin_1');
    expect(context.user?.tenantId).toBe('t1');
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

  it('should represent unauthenticated state as undefined user', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue(null);
    mockNextHeaders.mockReturnValue(new Headers());
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext(getDependencies());

    expect(context.user).toBeUndefined();
    expect(context.correlationId).toBeDefined();
    expect(context.requestId).toBeDefined();
  });

  it('should use tenant from tenantResolver', async () => {
    vi.mocked(identityProvider.getCurrentIdentity).mockResolvedValue({
      id: 'user_multi',
    });
    vi.mocked(tenantResolver.resolve).mockResolvedValue({
      tenantId: 'org_abc',
      userId: 'user_multi',
    });

    mockNextHeaders.mockReturnValue(new Headers());
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext(getDependencies());

    expect(context.user?.tenantId).toBe('org_abc');
  });
});
