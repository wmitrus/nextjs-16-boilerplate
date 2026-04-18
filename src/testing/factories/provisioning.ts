import type {
  NodeProvisioningAccessAllowed,
  NodeProvisioningAccessDiagnostics,
  NodeProvisioningAccessOutcome,
} from '@/security/core/node-provisioning-access';

function makeProvisioningDiagnostics(
  overrides: Partial<NodeProvisioningAccessDiagnostics> = {},
): NodeProvisioningAccessDiagnostics {
  return {
    tenancyMode: 'personal',
    userRecordExists: true,
    tenantRecordExists: true,
    membershipExists: true,
    onboardingStateExists: true,
    onboardingComplete: true,
    provisioningRequired: false,
    reason: 'already_ready',
    ...overrides,
  };
}

export function makeAllowedProvisioningAccess(
  overrides: Partial<NodeProvisioningAccessAllowed> = {},
): NodeProvisioningAccessAllowed {
  return {
    status: 'ALLOWED',
    identity: { id: 'user_test_1', email: 'user@test.dev' },
    tenant: {
      organizationId: 'tenant_test_1',
      tenantId: 'tenant_test_1',
      userId: 'user_test_1',
    },
    user: {
      id: 'user_test_1',
      email: 'user@test.dev',
      onboardingComplete: true,
    },
    diagnostics: makeProvisioningDiagnostics(),
    ...overrides,
  };
}

export function makeDeniedProvisioningAccess(
  outcome: Exclude<
    NodeProvisioningAccessOutcome,
    NodeProvisioningAccessAllowed
  >,
): Exclude<NodeProvisioningAccessOutcome, NodeProvisioningAccessAllowed> {
  return outcome;
}

export function makeTenantHeader(
  tenantId: string,
  headerName: string = 'x-tenant-id',
): Record<string, string> {
  return {
    [headerName]: tenantId,
  };
}

export function makeActiveTenantCookie(
  tenantId: string,
  cookieName: string = 'active_tenant_id',
): string {
  return `${cookieName}=${tenantId}; path=/`;
}

export function makeTenancyProfile(profile: {
  tenancyMode: 'single' | 'personal' | 'org';
  tenantContextSource?: 'provider' | 'db';
  defaultTenantId?: string;
}): {
  TENANCY_MODE: 'single' | 'personal' | 'org';
  TENANT_CONTEXT_SOURCE: 'provider' | 'db' | undefined;
  DEFAULT_TENANT_ID: string | undefined;
} {
  return {
    TENANCY_MODE: profile.tenancyMode,
    TENANT_CONTEXT_SOURCE: profile.tenantContextSource,
    DEFAULT_TENANT_ID: profile.defaultTenantId,
  };
}
