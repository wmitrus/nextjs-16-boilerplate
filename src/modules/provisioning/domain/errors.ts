/**
 * Thrown when adding a new user to a tenant would exceed the free-tier user limit.
 * Check is performed before membership insert — no rollback needed.
 */
export class TenantUserLimitReachedError extends Error {
  constructor(
    message = 'Free-tier user limit reached for this tenant. Upgrade your plan to add more users.',
  ) {
    super(message);
    this.name = 'TenantUserLimitReachedError';
  }
}

/**
 * Thrown when provisioning mode requires a tenant context (activeTenantId or tenantExternalId)
 * but none was provided in ProvisioningInput.
 * Applies to TENANCY_MODE=single and TENANCY_MODE=org without the required context.
 */
export class TenantContextRequiredError extends Error {
  constructor(
    message = 'Tenant context is required for this tenancy mode but was not provided.',
  ) {
    super(message);
    this.name = 'TenantContextRequiredError';
  }
}

/**
 * Thrown when required fields are missing from ProvisioningInput.
 * e.g. missing externalUserId or provider.
 */
export class MissingProvisioningInputError extends Error {
  constructor(message = 'Required provisioning input is missing.') {
    super(message);
    this.name = 'MissingProvisioningInputError';
  }
}
