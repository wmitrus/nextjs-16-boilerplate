import { describe, it, expect, beforeEach } from 'vitest';

import { authorize, enforceTenant, AuthorizationError } from './authorization';

import {
  createMockSecurityContext,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Authorization Engine', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  describe('authorize', () => {
    it('should allow admin for admin requirement', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'admin' },
      });
      expect(() => authorize(ctx, 'admin')).not.toThrow();
    });

    it('should allow admin for user requirement', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'admin' },
      });
      expect(() => authorize(ctx, 'user')).not.toThrow();
    });

    it('should deny user for admin requirement', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'user' },
      });
      expect(() => authorize(ctx, 'admin')).toThrow(AuthorizationError);
    });

    it('should allow user for user requirement', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'user' },
      });
      expect(() => authorize(ctx, 'user')).not.toThrow();
    });

    it('should deny guest for user requirement', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'guest' },
      });
      expect(() => authorize(ctx, 'user')).toThrow(AuthorizationError);
    });

    it('should throw when user is missing', () => {
      const ctx = createMockSecurityContext({ user: undefined });
      expect(() => authorize(ctx, 'user')).toThrow('Authentication required');
    });

    it('should allow guest for guest requirement', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'guest' },
      });
      expect(() => authorize(ctx, 'guest')).not.toThrow();
    });
  });

  describe('enforceTenant', () => {
    it('should allow access for matching tenant', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'user', tenantId: 'tenant_1' },
      });
      expect(() => enforceTenant(ctx, 'tenant_1')).not.toThrow();
    });

    it('should deny access for mismatching tenant', () => {
      const ctx = createMockSecurityContext({
        user: { id: 'user_1', role: 'user', tenantId: 'tenant_1' },
      });
      expect(() => enforceTenant(ctx, 'tenant_2')).toThrow(AuthorizationError);
    });

    it('should throw when user is missing', () => {
      const ctx = createMockSecurityContext({ user: undefined });
      expect(() => enforceTenant(ctx, 'tenant_1')).toThrow(
        'Authentication required',
      );
    });
  });
});
