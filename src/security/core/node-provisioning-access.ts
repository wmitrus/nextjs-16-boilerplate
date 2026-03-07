import type { Identity, IdentityProvider } from '@/core/contracts/identity';
import { UserNotProvisionedError } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
  TenantNotProvisionedError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';
import type { User, UserRepository } from '@/core/contracts/user';

export type ProvisioningTenancyMode = 'single' | 'personal' | 'org';

export type NodeProvisioningAccessStatus =
  | 'ALLOWED'
  | 'UNAUTHENTICATED'
  | 'BOOTSTRAP_REQUIRED'
  | 'ONBOARDING_REQUIRED'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'FORBIDDEN';

export type NodeProvisioningDenyCode =
  | 'UNAUTHENTICATED'
  | 'BOOTSTRAP_REQUIRED'
  | 'ONBOARDING_INCOMPLETE'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'DEFAULT_TENANT_NOT_FOUND'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'FORBIDDEN';

export interface NodeProvisioningAccessAllowed {
  readonly status: 'ALLOWED';
  readonly identity: Identity;
  readonly tenant: TenantContext;
  readonly user: User;
}

export interface NodeProvisioningAccessDenied {
  readonly status: Exclude<NodeProvisioningAccessStatus, 'ALLOWED'>;
  readonly code: NodeProvisioningDenyCode;
  readonly message: string;
}

export type NodeProvisioningAccessOutcome =
  | NodeProvisioningAccessAllowed
  | NodeProvisioningAccessDenied;

interface NodeProvisioningAccessDependencies {
  readonly identityProvider: IdentityProvider;
  readonly tenantResolver: TenantResolver;
  readonly userRepository: UserRepository;
  readonly tenancyMode: ProvisioningTenancyMode;
  readonly tenantExistsProbe?: (tenantId: string) => Promise<boolean>;
  readonly authorize?: (context: {
    readonly identity: Identity;
    readonly tenant: TenantContext;
    readonly user: User;
  }) => Promise<boolean>;
}

export async function evaluateNodeProvisioningAccess(
  deps: NodeProvisioningAccessDependencies,
): Promise<NodeProvisioningAccessOutcome> {
  let identity: Identity | null;

  try {
    identity = await deps.identityProvider.getCurrentIdentity();
  } catch (error) {
    if (error instanceof UserNotProvisionedError) {
      return {
        status: 'BOOTSTRAP_REQUIRED',
        code: 'BOOTSTRAP_REQUIRED',
        message:
          'User is authenticated externally but not provisioned internally. Bootstrap required.',
      };
    }
    throw error;
  }

  if (!identity) {
    return {
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
    };
  }

  const user = await deps.userRepository.findById(identity.id);

  if (!user) {
    return {
      status: 'BOOTSTRAP_REQUIRED',
      code: 'BOOTSTRAP_REQUIRED',
      message:
        'User record is missing in internal database. Bootstrap required.',
    };
  }

  if (!user.onboardingComplete) {
    return {
      status: 'ONBOARDING_REQUIRED',
      code: 'ONBOARDING_INCOMPLETE',
      message:
        'Onboarding must be completed before accessing protected resources.',
    };
  }

  let tenant: TenantContext;
  try {
    tenant = await deps.tenantResolver.resolve(identity);
  } catch (error) {
    if (
      error instanceof MissingTenantContextError ||
      error instanceof TenantNotProvisionedError
    ) {
      return {
        status: 'TENANT_CONTEXT_REQUIRED',
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'Tenant context required.',
      };
    }

    if (error instanceof TenantMembershipRequiredError) {
      return {
        status: 'TENANT_MEMBERSHIP_REQUIRED',
        code: 'TENANT_MEMBERSHIP_REQUIRED',
        message: 'Tenant membership required.',
      };
    }

    throw error;
  }

  if (deps.tenancyMode === 'single' && deps.tenantExistsProbe) {
    const tenantExists = await deps.tenantExistsProbe(tenant.tenantId);
    if (!tenantExists) {
      return {
        status: 'TENANT_CONTEXT_REQUIRED',
        code: 'DEFAULT_TENANT_NOT_FOUND',
        message:
          'Default tenant from configuration does not exist in database. Fix DEFAULT_TENANT_ID seed/config mismatch.',
      };
    }
  }

  if (deps.authorize) {
    const allowed = await deps.authorize({ identity, tenant, user });
    if (!allowed) {
      return {
        status: 'FORBIDDEN',
        code: 'FORBIDDEN',
        message: 'Forbidden.',
      };
    }
  }

  return {
    status: 'ALLOWED',
    identity,
    tenant,
    user,
  };
}
