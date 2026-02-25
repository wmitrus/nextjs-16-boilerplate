import type {
  AuthorizationContext,
  Policy,
  PolicyRepository,
  RoleRepository,
} from '@/core/contracts/repositories';

export class MockRoleRepository implements RoleRepository {
  async getRoles(subjectId: string, _tenantId: string): Promise<string[]> {
    // In a real app, this would query a database
    if (subjectId.startsWith('user_admin')) {
      return ['admin'];
    }
    return ['user'];
  }
}

export class MockPolicyRepository implements PolicyRepository {
  async getPolicies(context: AuthorizationContext): Promise<Policy[]> {
    const policies: Policy[] = [
      {
        effect: 'allow',
        actions: ['document:read'],
        resource: 'document',
      },
      {
        effect: 'allow',
        actions: ['system:manage'],
        resource: 'all',
        condition: (ctx) => ctx.subject.id.includes('admin'),
      },
    ];

    // Filter policies based on action and resource type
    return policies.filter(
      (p) =>
        p.actions.includes(context.action) &&
        (p.resource === context.resource.type || p.resource === 'all'),
    );
  }
}
