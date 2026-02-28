import type {
  AuthorizationContext,
  MembershipRepository,
  Policy,
  PolicyRepository,
  RoleRepository,
  TenantAttributes,
  TenantAttributesRepository,
} from '@/core/contracts/repositories';
import { ROLES } from '@/core/contracts/roles';

import {
  hasAttribute,
  isFromAllowedIp,
  isNotFromBlockedIp,
  isOwner,
} from '../domain/policy/ConditionEvaluator';

export class MockRoleRepository implements RoleRepository {
  async getRoles(subjectId: string, _tenantId: string): Promise<string[]> {
    if (subjectId.startsWith('user_admin')) {
      return [ROLES.ADMIN];
    }
    return [ROLES.USER];
  }
}

export class MockPolicyRepository implements PolicyRepository {
  async getPolicies(_context: AuthorizationContext): Promise<Policy[]> {
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['route:access'],
        resource: 'route',
        condition: (ctx) => Boolean(ctx.subject.id),
      },
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'document',
      },
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'document',
        condition: (ctx) => isNotFromBlockedIp(ctx, ['10.0.0.1']),
      },
      {
        effect: 'allow',
        actions: ['system:execute'],
        resource: 'system',
        condition: (ctx) => Boolean(ctx.subject.id),
      },
      {
        effect: 'allow',
        actions: ['system:manage'],
        resource: 'all',
        condition: (ctx) => ctx.subject.id.includes('admin'),
      },
      {
        effect: 'allow',
        actions: ['document:own'],
        resource: 'document',
        condition: (ctx) => isOwner(ctx),
      },
      {
        effect: 'allow',
        actions: ['pro:feature'],
        resource: 'pro',
        condition: (ctx) => hasAttribute(ctx, 'plan', 'pro'),
      },
      {
        effect: 'allow',
        actions: ['internal:access'],
        resource: 'internal',
        condition: (ctx) => isFromAllowedIp(ctx, ['127.0.0.1', '::1']),
      },
    ];

    return policies;
  }
}

export class MockMembershipRepository implements MembershipRepository {
  async isMember(subjectId: string, tenantId: string): Promise<boolean> {
    const memberTenants = subjectId.startsWith('user_')
      ? ['t1', 'tenant_123', 'test-tenant']
      : ['t1'];

    return memberTenants.includes(tenantId);
  }
}

export class MockTenantAttributesRepository implements TenantAttributesRepository {
  async getTenantAttributes(_tenantId: string): Promise<TenantAttributes> {
    return {
      plan: 'free',
      subscriptionStatus: 'active',
      features: [],
      contractType: 'standard',
    };
  }
}
