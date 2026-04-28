import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

export const DEFAULT_APP_ENTRY_URL = '/dashboard';
const BOOTSTRAP_START_PATH = '/auth/bootstrap/start';

export function buildBootstrapRedirectUrl(
  requestedUrl?: string,
  fallback: string = DEFAULT_APP_ENTRY_URL,
): string {
  const safeTarget = sanitizeRedirectUrl(requestedUrl ?? fallback, fallback);

  if (safeTarget.startsWith(BOOTSTRAP_START_PATH)) {
    return safeTarget;
  }

  const params = new URLSearchParams({ redirect_url: safeTarget });

  return `/auth/bootstrap/start?${params.toString()}`;
}
