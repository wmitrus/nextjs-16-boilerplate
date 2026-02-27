'use server';

import { z } from 'zod';

import { createContainer } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { RoleRepository } from '@/core/contracts/repositories';
import { ROLES } from '@/core/contracts/roles';
import type { TenantResolver } from '@/core/contracts/tenancy';

import { createSecureAction } from '@/security/actions/secure-action';
import {
  createSecurityContext,
  type SecurityContextDependencies,
} from '@/security/core/security-context';

const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  notificationsEnabled: z.boolean(),
  marketingConsent: z.boolean(),
});

function createSecurityDependencies() {
  const requestContainer = createContainer();
  const securityContextDependencies: SecurityContextDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
    roleRepository: requestContainer.resolve<RoleRepository>(
      AUTHORIZATION.ROLE_REPOSITORY,
    ),
  };

  return {
    getSecurityContext: () =>
      createSecurityContext(securityContextDependencies),
    authorizationService: requestContainer.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    ),
  };
}

/**
 * Example of a Secure Server Action.
 * Demonstrates: Zod validation, Auth requirement, Mutation Logging, and Replay Protection.
 */
export const updateSecuritySettings = createSecureAction({
  schema: updateSettingsSchema,
  role: ROLES.USER,
  dependencies: createSecurityDependencies,
  handler: async ({ context }) => {
    // In a real app, you would save to the database here
    // e.g., await db.user.update({ where: { id: context.user.id }, data: input });

    return {
      message: 'Settings updated successfully',
      updatedAt: new Date().toISOString(),
      user: context.user?.id,
    };
  },
});
