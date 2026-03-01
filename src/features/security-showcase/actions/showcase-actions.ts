'use server';

import { z } from 'zod';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import { getAppContainer } from '@/core/runtime/bootstrap';

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
  const requestContainer = getAppContainer().createChild();
  const securityContextDependencies: SecurityContextDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
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
