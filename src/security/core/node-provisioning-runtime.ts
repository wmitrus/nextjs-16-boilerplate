import type { Container } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { OrganizationScopeAuthority } from '@/core/contracts/access-scope-authority';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';

import {
  evaluateNodeProvisioningAccess,
  type NodeProvisioningAccessOutcome,
} from './node-provisioning-access';

export async function resolveNodeProvisioningAccess(
  container: Container,
): Promise<NodeProvisioningAccessOutcome> {
  const requestIdentitySource = container.resolve<RequestIdentitySource>(
    AUTH.IDENTITY_SOURCE,
  );
  const identityProvider = container.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );
  const tenantResolver = container.resolve<TenantResolver>(
    AUTH.TENANT_RESOLVER,
  );
  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );
  const organizationScopeAuthority =
    container.resolve<OrganizationScopeAuthority>(
      AUTHORIZATION.ORGANIZATION_SCOPE_AUTHORITY,
    );

  const rawIdentity = await requestIdentitySource.get();

  return evaluateNodeProvisioningAccess({
    identityProvider,
    tenantResolver,
    organizationScopeAuthority,
    userRepository,
    rawIdentity,
  });
}
