export class AuditSettingNotFoundError extends Error {
  readonly code = 'AUDIT_SETTING_NOT_FOUND';
  constructor(message = 'Audit log setting not found') {
    super(message);
    this.name = 'AuditSettingNotFoundError';
  }
}

/**
 * Thrown when a mutation's target scope (tenantId) does not match the
 * caller's verified `MutationScope`. Defense in depth: the route handler
 * must already derive/reject the scope before calling the service (SEC-26,
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`), but the service must not
 * depend solely on that — see `02 - Security & Auth - Summary.md`.
 */
export class AuditSettingScopeError extends Error {
  readonly code = 'AUDIT_SETTING_SCOPE_ERROR';
  constructor(message = 'Requested scope does not match caller scope') {
    super(message);
    this.name = 'AuditSettingScopeError';
  }
}

export class InvalidAuditRetentionDaysError extends Error {
  readonly code = 'INVALID_AUDIT_RETENTION_DAYS';
  constructor(message = 'retentionDays is outside the allowed range') {
    super(message);
    this.name = 'InvalidAuditRetentionDaysError';
  }
}

export class InvalidAuditSampleRateError extends Error {
  readonly code = 'INVALID_AUDIT_SAMPLE_RATE';
  constructor(message = 'sampleRate is outside the allowed range') {
    super(message);
    this.name = 'InvalidAuditSampleRateError';
  }
}
