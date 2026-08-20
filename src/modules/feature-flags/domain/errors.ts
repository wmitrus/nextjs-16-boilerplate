export class DuplicateFeatureFlagError extends Error {
  readonly code = 'DUPLICATE_FEATURE_FLAG';
  constructor(
    message = 'A feature flag with this key already exists for this scope',
  ) {
    super(message);
    this.name = 'DuplicateFeatureFlagError';
  }
}

export class FeatureFlagNotFoundError extends Error {
  readonly code = 'FEATURE_FLAG_NOT_FOUND';
  constructor(message = 'Feature flag not found') {
    super(message);
    this.name = 'FeatureFlagNotFoundError';
  }
}
