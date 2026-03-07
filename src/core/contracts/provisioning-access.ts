export type ProvisioningAccessDenyStatus =
  | 'UNAUTHENTICATED'
  | 'BOOTSTRAP_REQUIRED'
  | 'ONBOARDING_REQUIRED'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'FORBIDDEN';

export type ProvisioningApiErrorCode =
  | 'UNAUTHORIZED'
  | 'BOOTSTRAP_REQUIRED'
  | 'ONBOARDING_REQUIRED'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'DEFAULT_TENANT_NOT_FOUND'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'FORBIDDEN';

export interface ProvisioningStatusSnapshot {
  readonly authenticated: true;
  readonly internalUserId: string;
  readonly internalTenantId: string;
  readonly onboardingComplete: boolean;
  readonly tenancyMode: 'single' | 'personal' | 'org';
  readonly tenantContextSource: 'provider' | 'db' | null;
}
