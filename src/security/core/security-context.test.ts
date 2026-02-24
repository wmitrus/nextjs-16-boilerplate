/** @vitest-environment node */
import '@/testing/infrastructure/clerk';
import '@/testing/infrastructure/next-headers';
import '@/shared/lib/network/get-ip.mock';

import { describe, it, expect, beforeEach } from 'vitest';

import { getSecurityContext } from './security-context';

import {
  mockAuth,
  mockNextHeaders,
  mockGetIP,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Security Context', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('should return guest context when not authenticated', async () => {
    mockAuth.mockResolvedValue({
      userId: null,
      sessionClaims: null,
    });
    mockNextHeaders.mockReturnValue(new Headers());
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext();

    expect(context.user).toBeUndefined();
    expect(context.ip).toBe('127.0.0.1');
    expect(context.correlationId).toBeDefined();
  });

  it('should return user context when authenticated as user', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_123',
      sessionClaims: { metadata: { role: 'user', tenantId: 'tenant_123' } },
    });
    mockNextHeaders.mockReturnValue(
      new Headers({
        'user-agent': 'test-agent',
        'x-correlation-id': 'test-correlation',
      }),
    );
    mockGetIP.mockResolvedValue('1.1.1.1');

    const context = await getSecurityContext();

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
    mockAuth.mockResolvedValue({
      userId: 'admin_1',
      sessionClaims: { metadata: { role: 'admin' } },
    });
    mockNextHeaders.mockReturnValue(new Headers());
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext();

    expect(context.user?.role).toBe('admin');
  });

  it('should use provided x-request-id if present', async () => {
    mockAuth.mockResolvedValue({
      userId: null,
      sessionClaims: null,
    });
    mockNextHeaders.mockReturnValue(
      new Headers({
        'x-request-id': 'req_123',
      }),
    );
    mockGetIP.mockResolvedValue('127.0.0.1');

    const context = await getSecurityContext();

    expect(context.requestId).toBe('req_123');
  });
});
