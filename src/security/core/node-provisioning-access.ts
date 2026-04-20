import type {
  Identity,
  IdentityProvider,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';
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

export type UsersGuardDecisionReason =
  | 'already_ready'
  | 'unauthenticated'
  | 'provisioning_required'
  | 'missing_user'
  | 'missing_tenant'
  | 'missing_membership'
  | 'missing_onboarding_state'
  | 'forbidden'
  | 'unsupported_state';

export interface NodeProvisioningAccessDiagnostics {
  readonly externalUserId?: string;
  readonly externalOrgId?: string;
  readonly internalIdentityId?: string;
  readonly internalOrganizationId?: string;
  readonly tenancyMode: ProvisioningTenancyMode;
  readonly userRecordExists: boolean | null;
  readonly tenantRecordExists: boolean | null;
  readonly membershipExists: boolean | null;
  readonly onboardingStateExists: boolean | null;
  readonly onboardingComplete: boolean | null;
  readonly provisioningRequired: boolean;
  readonly reason: UsersGuardDecisionReason;
}

export interface NodeProvisioningAccessAllowed {
  readonly status: 'ALLOWED';
  readonly identity: Identity;
  readonly tenant: TenantContext;
  readonly user: User;
  readonly diagnostics: NodeProvisioningAccessDiagnostics;
}

export interface NodeProvisioningAccessDenied {
  readonly status: Exclude<NodeProvisioningAccessStatus, 'ALLOWED'>;
  readonly code: NodeProvisioningDenyCode;
  readonly message: string;
  readonly diagnostics: NodeProvisioningAccessDiagnostics;
}

export type NodeProvisioningAccessOutcome =
  | NodeProvisioningAccessAllowed
  | NodeProvisioningAccessDenied;

interface NodeProvisioningAccessDependencies {
  readonly identityProvider: IdentityProvider;
  readonly tenantResolver: TenantResolver;
  readonly userRepository: UserRepository;
  readonly tenancyMode: ProvisioningTenancyMode;
  readonly rawIdentity?: RequestIdentitySourceData;
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
  const externalUserId = deps.rawIdentity?.userId;
  const externalOrgId = deps.rawIdentity?.orgExternalId;

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
        diagnostics: {
          externalUserId,
          externalOrgId,
          tenancyMode: deps.tenancyMode,
          userRecordExists: false,
          tenantRecordExists: null,
          membershipExists: null,
          onboardingStateExists: null,
          onboardingComplete: null,
          provisioningRequired: true,
          reason: 'provisioning_required',
        },
      };
    }
    throw error;
  }

  if (!identity) {
    return {
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
      diagnostics: {
        externalUserId,
        externalOrgId,
        tenancyMode: deps.tenancyMode,
        userRecordExists: null,
        tenantRecordExists: null,
        membershipExists: null,
        onboardingStateExists: null,
        onboardingComplete: null,
        provisioningRequired: false,
        reason: 'unauthenticated',
      },
    };
  }

  const user = await deps.userRepository.findById(identity.id);

  if (!user) {
    return {
      status: 'BOOTSTRAP_REQUIRED',
      code: 'BOOTSTRAP_REQUIRED',
      message:
        'User record is missing in internal database. Bootstrap required.',
      diagnostics: {
        externalUserId,
        externalOrgId,
        internalIdentityId: identity.id,
        tenancyMode: deps.tenancyMode,
        userRecordExists: false,
        tenantRecordExists: null,
        membershipExists: null,
        onboardingStateExists: false,
        onboardingComplete: null,
        provisioningRequired: true,
        reason: 'missing_user',
      },
    };
  }

  if (!user.onboardingComplete) {
    return {
      status: 'ONBOARDING_REQUIRED',
      code: 'ONBOARDING_INCOMPLETE',
      message:
        'Onboarding must be completed before accessing protected resources.',
      diagnostics: {
        externalUserId,
        externalOrgId,
        internalIdentityId: identity.id,
        tenancyMode: deps.tenancyMode,
        userRecordExists: true,
        tenantRecordExists: null,
        membershipExists: null,
        onboardingStateExists: true,
        onboardingComplete: false,
        provisioningRequired: false,
        reason: 'missing_onboarding_state',
      },
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
        diagnostics: {
          externalUserId,
          externalOrgId,
          internalIdentityId: identity.id,
          tenancyMode: deps.tenancyMode,
          userRecordExists: true,
          tenantRecordExists: false,
          membershipExists: null,
          onboardingStateExists: true,
          onboardingComplete: true,
          provisioningRequired: false,
          reason: 'missing_tenant',
        },
      };
    }

    if (error instanceof TenantMembershipRequiredError) {
      return {
        status: 'TENANT_MEMBERSHIP_REQUIRED',
        code: 'TENANT_MEMBERSHIP_REQUIRED',
        message: 'Tenant membership required.',
        diagnostics: {
          externalUserId,
          externalOrgId,
          internalIdentityId: identity.id,
          tenancyMode: deps.tenancyMode,
          userRecordExists: true,
          tenantRecordExists: true,
          membershipExists: false,
          onboardingStateExists: true,
          onboardingComplete: true,
          provisioningRequired: false,
          reason: 'missing_membership',
        },
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
        diagnostics: {
          externalUserId,
          externalOrgId,
          internalIdentityId: identity.id,
          internalOrganizationId: tenant.organizationId,
          tenancyMode: deps.tenancyMode,
          userRecordExists: true,
          tenantRecordExists: false,
          membershipExists: null,
          onboardingStateExists: true,
          onboardingComplete: true,
          provisioningRequired: false,
          reason: 'missing_tenant',
        },
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
        diagnostics: {
          externalUserId,
          externalOrgId,
          internalIdentityId: identity.id,
          internalOrganizationId: tenant.organizationId,
          tenancyMode: deps.tenancyMode,
          userRecordExists: true,
          tenantRecordExists: true,
          membershipExists: true,
          onboardingStateExists: true,
          onboardingComplete: true,
          provisioningRequired: false,
          reason: 'forbidden',
        },
      };
    }
  }

  return {
    status: 'ALLOWED',
    identity,
    tenant,
    user,
    diagnostics: {
      externalUserId,
      externalOrgId,
      internalIdentityId: identity.id,
      internalOrganizationId: tenant.organizationId,
      tenancyMode: deps.tenancyMode,
      userRecordExists: true,
      tenantRecordExists: true,
      membershipExists: true,
      onboardingStateExists: true,
      onboardingComplete: true,
      provisioningRequired: false,
      reason: 'already_ready',
    },
  };
}
