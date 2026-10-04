export class AuditSettingNotFoundError extends Error {
  readonly code = 'AUDIT_SETTING_NOT_FOUND';
  constructor(message = 'Audit log setting not found') {
    super(message);
    this.name = 'AuditSettingNotFoundError';
  }
}

export class AuditSettingAliasConflictError extends Error {
  readonly code = 'AUDIT_SETTING_ALIAS_CONFLICT';

  constructor(
    message = 'Audit log setting alias conflicts with an existing legacy override',
  ) {
    super(message);
    this.name = 'AuditSettingAliasConflictError';
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

/**
 * OZI-71 AUD·B — thrown when a canonical audit write cannot prove its
 * organization/tenant ownership tuple in the same SQL statement.
 *
 * This is a server-side invariant failure, never a signal to reclassify the
 * event as platform-global. The resilient audit boundary catches the failure
 * and drops the DB write without affecting the caller operation.
 */
export class AuditCanonicalWriteInvariantError extends Error {
  readonly code = 'AUDIT_CANONICAL_WRITE_INVARIANT';

  constructor(message = 'Audit canonical write invariant violated') {
    super(message);
    this.name = 'AuditCanonicalWriteInvariantError';
  }
}
