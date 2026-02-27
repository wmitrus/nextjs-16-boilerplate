/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

import { DefaultAuthorizationService } from '@/modules/authorization/domain/AuthorizationService';
import { PolicyEngine } from '@/modules/authorization/domain/policy/PolicyEngine';
import {
  MockMembershipRepository,
  MockPolicyRepository,
} from '@/modules/authorization/infrastructure/MockRepositories';

describe('Authorization Integration', () => {
  const authzService = new DefaultAuthorizationService(
    new MockPolicyRepository(),
    new MockMembershipRepository(),
    new PolicyEngine(),
  );

  it('should allow "read" action on "document" for regular user', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 't1', userId: 'user_1' },
      subject: { id: 'user_1' },
      resource: { type: 'document', id: 'doc_1' },
      action: 'document:read',
    };

    const result = await authzService.can(context);
    expect(result).toBe(true);
  });

  it('should deny "write" action on "document" for regular user', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 't1', userId: 'user_1' },
      subject: { id: 'user_1' },
      resource: { type: 'document', id: 'doc_1' },
      action: 'document:write',
    };

    const result = await authzService.can(context);
    expect(result).toBe(false);
  });

  it('should allow "manage" action for admin user (ABAC condition)', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 't1', userId: 'user_admin_1' },
      subject: { id: 'user_admin_1' },
      resource: { type: 'document', id: 'doc_1' },
      action: 'system:manage',
    };

    const result = await authzService.can(context);
    expect(result).toBe(true);
  });

  it('should deny "manage" action for regular user', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 't1', userId: 'user_regular_1' },
      subject: { id: 'user_regular_1' },
      resource: { type: 'document', id: 'doc_1' },
      action: 'system:manage',
    };

    const result = await authzService.can(context);
    expect(result).toBe(false);
  });

  it('should handle complex resource matching', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 't1', userId: 'user_admin_1' },
      subject: { id: 'user_admin_1' },
      resource: { type: 'other_resource' },
      action: 'system:manage',
    };

    const result = await authzService.can(context);
    expect(result).toBe(true);
  });

  it('should deny access when subject is not a member of the requested tenant', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 'other-tenant', userId: 'user_1' },
      subject: { id: 'user_1' },
      resource: { type: 'document', id: 'doc_1' },
      action: 'document:read',
    };

    const result = await authzService.can(context);
    expect(result).toBe(false);
  });

  it('should allow access when subject has membership in the requested tenant', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 'tenant_123', userId: 'user_1' },
      subject: { id: 'user_1' },
      resource: { type: 'document', id: 'doc_1' },
      action: 'document:read',
    };

    const result = await authzService.can(context);
    expect(result).toBe(true);
  });

  it('should deny access for non-user subject ID accessing tenant beyond t1', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 'tenant_123', userId: 'service_account' },
      subject: { id: 'service_account' },
      resource: { type: 'document', id: 'doc_1' },
      action: 'document:read',
    };

    const result = await authzService.can(context);
    expect(result).toBe(false);
  });

  it('should deny route access for empty subject ID', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 't1', userId: '' },
      subject: { id: '' },
      resource: { type: 'route', id: '/dashboard' },
      action: 'route:access',
    };

    const result = await authzService.can(context);
    expect(result).toBe(false);
  });

  it('should deny when no policies match the action', async () => {
    const context: AuthorizationContext = {
      tenant: { tenantId: 't1', userId: 'user_1' },
      subject: { id: 'user_1' },
      resource: { type: 'billing', id: 'inv_1' },
      action: 'billing:delete',
    };

    const result = await authzService.can(context);
    expect(result).toBe(false);
  });
});
