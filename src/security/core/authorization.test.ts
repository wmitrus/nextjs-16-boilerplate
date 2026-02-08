import { describe, it, expect } from 'vitest';

import { authorize, enforceTenant, AuthorizationError } from './authorization';
import type { SecurityContext } from './security-context';

describe('Authorization Engine', () => {
  const mockContext = (
    role: 'admin' | 'user' | 'guest',
    tenantId?: string,
  ): SecurityContext => ({
    user: { id: 'user_1', role, tenantId },
    ip: '127.0.0.1',
    correlationId: 'test-id',
    requestId: 'req-id',
    runtime: 'node',
    environment: 'development',
  });

  describe('authorize', () => {
    it('should allow admin for admin requirement', () => {
      const ctx = mockContext('admin');
      expect(() => authorize(ctx, 'admin')).not.toThrow();
    });

    it('should allow admin for user requirement', () => {
      const ctx = mockContext('admin');
      expect(() => authorize(ctx, 'user')).not.toThrow();
    });

    it('should deny user for admin requirement', () => {
      const ctx = mockContext('user');
      expect(() => authorize(ctx, 'admin')).toThrow(AuthorizationError);
    });

    it('should allow user for user requirement', () => {
      const ctx = mockContext('user');
      expect(() => authorize(ctx, 'user')).not.toThrow();
    });

    it('should deny guest for user requirement', () => {
      const ctx = mockContext('guest');
      expect(() => authorize(ctx, 'user')).toThrow(AuthorizationError);
    });
  });

  describe('enforceTenant', () => {
    it('should allow access for matching tenant', () => {
      const ctx = mockContext('user', 'tenant_1');
      expect(() => enforceTenant(ctx, 'tenant_1')).not.toThrow();
    });

    it('should deny access for mismatching tenant', () => {
      const ctx = mockContext('user', 'tenant_1');
      expect(() => enforceTenant(ctx, 'tenant_2')).toThrow(AuthorizationError);
    });
  });
});
