import type { Container, Module } from '@/core/container';
import { AUTHORIZATION } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db';

import { DefaultAuthorizationService } from './domain/AuthorizationService';
import { PolicyEngine } from './domain/policy/PolicyEngine';
import { DrizzleMembershipRepository } from './infrastructure/drizzle/DrizzleMembershipRepository';
import { DrizzlePolicyRepository } from './infrastructure/drizzle/DrizzlePolicyRepository';
import { DrizzleRoleRepository } from './infrastructure/drizzle/DrizzleRoleRepository';
import { DrizzleTenantAttributesRepository } from './infrastructure/drizzle/DrizzleTenantAttributesRepository';

export interface AuthorizationModuleDeps {
  db: DrizzleDb;
}

export function createAuthorizationModule(
  deps: AuthorizationModuleDeps,
): Module {
  const { db } = deps;

  return {
    register(container: Container) {
      const policyRepository = new DrizzlePolicyRepository(db);
      const roleRepository = new DrizzleRoleRepository(db);
      const membershipRepository = new DrizzleMembershipRepository(db);
      const tenantAttributesRepository = new DrizzleTenantAttributesRepository(
        db,
      );

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
}
