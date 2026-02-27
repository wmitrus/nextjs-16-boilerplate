import type { Container, Module } from '@/core/container';
import { AUTHORIZATION } from '@/core/contracts';

import { DefaultAuthorizationService } from './domain/AuthorizationService';
import { PolicyEngine } from './domain/policy/PolicyEngine';
import {
  MockMembershipRepository,
  MockPolicyRepository,
  MockRoleRepository,
  MockTenantAttributesRepository,
} from './infrastructure/MockRepositories';

export const authorizationModule: Module = {
  register(container: Container) {
    const policyRepository = new MockPolicyRepository();
    const roleRepository = new MockRoleRepository();
    const membershipRepository = new MockMembershipRepository();
    const tenantAttributesRepository = new MockTenantAttributesRepository();

    const engine = new PolicyEngine();

    container.register(AUTHORIZATION.POLICY_REPOSITORY, policyRepository);
    container.register(AUTHORIZATION.ROLE_REPOSITORY, roleRepository);
    container.register(
      AUTHORIZATION.MEMBERSHIP_REPOSITORY,
      membershipRepository,
    );
    container.register(AUTHORIZATION.PERMISSION_REPOSITORY, {
      getPermissions: async () => [],
    });
    container.register(
      AUTHORIZATION.TENANT_ATTRIBUTES_REPOSITORY,
      tenantAttributesRepository,
    );

    container.register(
      AUTHORIZATION.SERVICE,
      new DefaultAuthorizationService(
        policyRepository,
        membershipRepository,
        tenantAttributesRepository,
        engine,
      ),
    );
  },
};
