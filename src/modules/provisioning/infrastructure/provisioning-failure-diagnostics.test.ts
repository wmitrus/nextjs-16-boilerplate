import { describe, expect, it } from 'vitest';

import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { TenantMembershipRequiredError } from '@/core/contracts/tenancy';

import {
  CrossProviderLinkingNotAllowedError,
  MissingProvisioningInputError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '../domain/errors';

import { classifyProvisioningFailure } from './provisioning-failure-diagnostics';

describe('classifyProvisioningFailure', () => {
  it.each([
    [
      new CrossProviderLinkingNotAllowedError(),
      'CROSS_PROVIDER_LINKING_BLOCKED',
      'cross_provider_linking',
      'warn',
    ],
    [
      new TenantUserLimitReachedError(),
      'TENANT_USER_LIMIT_REACHED',
      'quota_exceeded',
      'warn',
    ],
    [
      new TenantContextRequiredError(),
      'TENANT_CONTEXT_REQUIRED',
      'tenant_config',
      'warn',
    ],
    [
      new TenantNotProvisionedError(),
      'TENANT_NOT_PROVISIONED',
      'tenant_config',
      'error',
    ],
    [
      new TenantMembershipRequiredError(),
      'TENANT_MEMBERSHIP_REQUIRED',
      'tenant_config',
      'warn',
    ],
    [
      new MissingProvisioningInputError(),
      'MISSING_PROVISIONING_INPUT',
      'tenant_config',
      'error',
    ],
  ] as const)(
    'maps %s to actionable operator diagnostics',
    (error, failureCode, userFacingError, severity) => {
      expect(classifyProvisioningFailure(error)).toMatchObject({
        failureCode,
        userFacingError,
        severity,
      });
      expect(classifyProvisioningFailure(error).operatorAction).toEqual(
        expect.any(String),
      );
    },
  );

  it('keeps unknown failures generic for users while preserving operator guidance', () => {
    expect(classifyProvisioningFailure(new Error('database exploded'))).toEqual(
      {
        failureCode: 'UNKNOWN_PROVISIONING_ERROR',
        operatorAction:
          'Inspect errorName, errorMessage, stage, requestId, and correlationId in the same log event.',
        userFacingError: 'db_error',
        severity: 'error',
      },
    );
  });
});
