import type {
  AuthorizationContext,
  MembershipRepository,
  Policy,
  PolicyRepository,
  RoleRepository,
} from '@/core/contracts/repositories';
import { ROLES } from '@/core/contracts/roles';

export class MockRoleRepository implements RoleRepository {
  async getRoles(subjectId: string, _tenantId: string): Promise<string[]> {
    // In a real app, this would query a database
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
    ];

    return policies;
  }
}

export class MockMembershipRepository implements MembershipRepository {
  async getTenantMemberships(subjectId: string): Promise<string[]> {
    if (subjectId.startsWith('user_')) {
      return ['t1', 'tenant_123', 'test-tenant'];
    }

    return ['t1'];
  }
}
