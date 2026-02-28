import type { Container, Module } from '@/core/container';
import { AUTHORIZATION } from '@/core/contracts';
import { env } from '@/core/env';

import { DefaultAuthorizationService } from './domain/AuthorizationService';
import { PolicyEngine } from './domain/policy/PolicyEngine';
import {
  InMemoryMembershipRepository,
  InMemoryPolicyRepository,
  InMemoryRoleRepository,
  InMemoryTenantAttributesRepository,
} from './infrastructure/memory/InMemoryRepositories';
import {
  MockMembershipRepository,
  MockPolicyRepository,
  MockRoleRepository,
  MockTenantAttributesRepository,
} from './infrastructure/MockRepositories';

function buildRepositories(nodeEnv: string) {
  if (nodeEnv === 'production') {
    throw new Error(
      '[authorizationModule] Production requires database-backed repository implementations. ' +
        'Register Prisma repositories before deploying. ' +
        'InMemory repositories are permissive and must never run in production.',
    );
  }

  if (nodeEnv === 'test') {
    return {
      policyRepository: new MockPolicyRepository(),
      roleRepository: new MockRoleRepository(),
      membershipRepository: new MockMembershipRepository(),
      tenantAttributesRepository: new MockTenantAttributesRepository(),
    };
  }

  return {
    policyRepository: new InMemoryPolicyRepository(),
    roleRepository: new InMemoryRoleRepository(),
    membershipRepository: new InMemoryMembershipRepository(),
    tenantAttributesRepository: new InMemoryTenantAttributesRepository(),
  };
}

export const authorizationModule: Module = {
  register(container: Container) {
    const {
      policyRepository,
      roleRepository,
      membershipRepository,
      tenantAttributesRepository,
    } = buildRepositories(env.NODE_ENV);

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
