import type {
  AuthorizationContext,
  MembershipRepository,
  Policy,
  PolicyRepository,
  RoleRepository,
  TenantAttributes,
  TenantAttributesRepository,
} from '@/core/contracts/repositories';

/**
 * In-memory RoleRepository for development and non-test environments.
 *
 * Returns no roles by default. Role data is expected to come from a
 * persistent store (e.g. Prisma) in production.
 *
 * Must NOT contain test-specific logic (e.g. ID prefix checks).
 */
export class InMemoryRoleRepository implements RoleRepository {
  async getRoles(_subjectId: string, _tenantId: string): Promise<string[]> {
    return [];
  }
}

/**
 * In-memory PolicyRepository for development and non-test environments.
 *
 * Returns a single allow-all policy so the application is usable during
 * development before a persistent policy store is wired up.
 *
 * Must NOT contain test-specific fixture logic.
 */
export class InMemoryPolicyRepository implements PolicyRepository {
  async getPolicies(_context: AuthorizationContext): Promise<Policy[]> {
    return [
      {
        effect: 'allow',
        actions: ['*:*'],
        resource: 'all',
        condition: (ctx) => Boolean(ctx.subject.id),
      },
    ];
  }
}

/**
 * In-memory MembershipRepository for development and non-test environments.
 *
 * Treats every authenticated subject as a member of any tenant.
 * This permissive default keeps the app usable in development before a
 * persistent membership store is wired up.
 *
 * Must NOT contain test-specific fixture logic.
 */
export class InMemoryMembershipRepository implements MembershipRepository {
  async isMember(_subjectId: string, _tenantId: string): Promise<boolean> {
    return true;
  }
}

/**
 * In-memory TenantAttributesRepository for development and non-test environments.
 *
 * Returns neutral default attributes. In production this is populated by the
 * billing module writing subscription/plan data to the database.
 *
 * Must NOT contain test-specific fixture logic.
 */
export class InMemoryTenantAttributesRepository implements TenantAttributesRepository {
  async getTenantAttributes(_tenantId: string): Promise<TenantAttributes> {
    return {
      plan: 'free',
      subscriptionStatus: 'active',
      features: [],
      contractType: 'standard',
    };
  }
}
