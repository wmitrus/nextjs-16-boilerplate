'use server';

import { z } from 'zod';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { createSecureAction } from '@/security/actions/secure-action';
import { createSecurityContext } from '@/security/core/security-context';
import type { NodeSecurityContextDependencies } from '@/security/core/security-dependencies';

const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  notificationsEnabled: z.boolean(),
  marketingConsent: z.boolean(),
});

function createSecurityDependencies() {
  const requestContainer = getAppContainer().createChild();
  const securityContextDependencies: NodeSecurityContextDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
    userRepository: requestContainer.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
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

export const updateSecuritySettings = createSecureAction({
  schema: updateSettingsSchema,
  dependencies: createSecurityDependencies,
  handler: async ({ context }) => {
    return {
      message: 'Settings updated successfully',
      updatedAt: new Date().toISOString(),
      user: context.user?.id,
    };
  },
});
