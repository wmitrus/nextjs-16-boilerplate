import type { Container, Module } from '@/core/container';
import { AUTHORIZATION } from '@/core/contracts';
import { db } from '@/core/db';
import { env } from '@/core/env';

import { DefaultAuthorizationService } from './domain/AuthorizationService';
import { PolicyEngine } from './domain/policy/PolicyEngine';
import { DrizzleMembershipRepository } from './infrastructure/drizzle/DrizzleMembershipRepository';
import { DrizzlePolicyRepository } from './infrastructure/drizzle/DrizzlePolicyRepository';
import { DrizzleRoleRepository } from './infrastructure/drizzle/DrizzleRoleRepository';
import { DrizzleTenantAttributesRepository } from './infrastructure/drizzle/DrizzleTenantAttributesRepository';
import {
  MockMembershipRepository,
  MockPolicyRepository,
  MockRoleRepository,
  MockTenantAttributesRepository,
} from './infrastructure/MockRepositories';

function buildRepositories(nodeEnv: string, dbProvider: string) {
  if (nodeEnv === 'test') {
    return {
      policyRepository: new MockPolicyRepository(),
      roleRepository: new MockRoleRepository(),
      membershipRepository: new MockMembershipRepository(),
      tenantAttributesRepository: new MockTenantAttributesRepository(),
    };
  }

  switch (dbProvider) {
    case 'drizzle':
      return {
        policyRepository: new DrizzlePolicyRepository(db),
        roleRepository: new DrizzleRoleRepository(db),
        membershipRepository: new DrizzleMembershipRepository(db),
        tenantAttributesRepository: new DrizzleTenantAttributesRepository(db),
      };
    default:
      throw new Error(
        `[authorizationModule] Unknown DB_PROVIDER: "${dbProvider}". ` +
          `Supported values: "drizzle".`,
      );
  }
}

export const authorizationModule: Module = {
  register(container: Container) {
    const {
      policyRepository,
      roleRepository,
      membershipRepository,
      tenantAttributesRepository,
    } = buildRepositories(env.NODE_ENV, env.DB_PROVIDER);

    const engine = new PolicyEngine();

    container.register(AUTHORIZATION.POLICY_REPOSITORY, policyRepository);
    container.register(AUTHORIZATION.ROLE_REPOSITORY, roleRepository);
    container.register(
      AUTHORIZATION.MEMBERSHIP_REPOSITORY,
      membershipRepository,
    );
    container.register(
      AUTHORIZATION.TENANT_ATTRIBUTES_REPOSITORY,
      tenantAttributesRepository,
    );

    container.register(
      AUTHORIZATION.SERVICE,
      new DefaultAuthorizationService(
        policyRepository,
        membershipRepository,
        roleRepository,
        tenantAttributesRepository,
        engine,
      ),
    );
  },
};
