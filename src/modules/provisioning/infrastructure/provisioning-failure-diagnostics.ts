import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';

import {
  CrossProviderLinkingNotAllowedError,
  MissingProvisioningInputError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '../domain/errors';

export type ProvisioningFailureCode =
  | 'CROSS_PROVIDER_LINKING_BLOCKED'
  | 'MISSING_PROVISIONING_INPUT'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'TENANT_NOT_PROVISIONED'
  | 'TENANT_USER_LIMIT_REACHED'
  | 'UNKNOWN_PROVISIONING_ERROR';

export interface ProvisioningFailureDiagnostics {
  failureCode: ProvisioningFailureCode;
  operatorAction: string;
  userFacingError:
    | 'cross_provider_linking'
    | 'quota_exceeded'
    | 'tenant_config'
    | 'db_error';
  severity: 'warn' | 'error';
}

export function classifyProvisioningFailure(
  err: unknown,
): ProvisioningFailureDiagnostics {
  if (err instanceof CrossProviderLinkingNotAllowedError) {
    return {
      failureCode: 'CROSS_PROVIDER_LINKING_BLOCKED',
      operatorAction:
        'Review CROSS_PROVIDER_EMAIL_LINKING policy or ask the user to sign in with the original provider.',
      userFacingError: 'cross_provider_linking',
      severity: 'warn',
    };
  }

  if (err instanceof TenantUserLimitReachedError) {
    return {
      failureCode: 'TENANT_USER_LIMIT_REACHED',
      operatorAction:
        'Increase the tenant user limit or remove inactive memberships before retrying sign-in.',
      userFacingError: 'quota_exceeded',
      severity: 'warn',
    };
  }

  if (err instanceof TenantContextRequiredError) {
    return {
      failureCode: 'TENANT_CONTEXT_REQUIRED',
      operatorAction:
        'Verify TENANCY_MODE, TENANT_CONTEXT_SOURCE, DEFAULT_TENANT_ID, and provider organization claims for this deployment.',
      userFacingError: 'tenant_config',
      severity: 'warn',
    };
  }

  if (err instanceof TenantNotProvisionedError) {
    return {
      failureCode: 'TENANT_NOT_PROVISIONED',
      operatorAction:
        'Align DEFAULT_TENANT_ID with an existing tenant/organization in the configured database, or repair the bootstrap RBAC data for that tenant.',
      userFacingError: 'tenant_config',
      severity: 'error',
    };
  }

  if (err instanceof TenantMembershipRequiredError) {
    return {
      failureCode: 'TENANT_MEMBERSHIP_REQUIRED',
      operatorAction:
        'Create or repair the membership row linking the authenticated user to the active organization.',
      userFacingError: 'tenant_config',
      severity: 'warn',
    };
  }

  if (err instanceof MissingProvisioningInputError) {
    return {
      failureCode: 'MISSING_PROVISIONING_INPUT',
      operatorAction:
        'Verify the active auth provider identity source supplies provider, external user id, and required tenant context.',
      userFacingError: 'tenant_config',
      severity: 'error',
    };
  }

  return {
    failureCode: 'UNKNOWN_PROVISIONING_ERROR',
    operatorAction:
      'Inspect errorName, errorMessage, stage, requestId, and correlationId in the same log event.',
    userFacingError: 'db_error',
    severity: 'error',
  };
}
