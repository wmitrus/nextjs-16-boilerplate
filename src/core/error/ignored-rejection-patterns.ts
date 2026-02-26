export const IGNORED_REJECTION_PATTERNS = [
  'cannot_render_single_session_enabled',
  'Network error',
  'Failed to fetch',
] as const;

export const IGNORED_SENTRY_PATTERNS = [
  'ResizeObserver loop limit exceeded',
  'Non-Error promise rejection captured',
  'Network request failed',
  'cannot_render_single_session_enabled',
] as const;
