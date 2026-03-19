import { BootstrapErrorUI } from './bootstrap-error';
import { BootstrapOrgRequired } from './bootstrap-org-required';

const KNOWN_ERRORS = [
  'cross_provider_linking',
  'quota_exceeded',
  'tenant_config',
  'db_error',
] as const;

type BootstrapPageError = (typeof KNOWN_ERRORS)[number];

const KNOWN_ERROR_SET = new Set<string>(KNOWN_ERRORS);
const ERROR_BY_REASON: Record<string, BootstrapPageError> = {
  'cross-provider-linking': 'cross_provider_linking',
  cross_provider_linking: 'cross_provider_linking',
  'quota-exceeded': 'quota_exceeded',
  quota_exceeded: 'quota_exceeded',
  'tenant-config': 'tenant_config',
  tenant_config: 'tenant_config',
  'tenant-lost': 'tenant_config',
  'db-error': 'db_error',
  db_error: 'db_error',
};

function resolveBootstrapError(
  error?: string,
  reason?: string,
): BootstrapPageError {
  if (error && KNOWN_ERROR_SET.has(error)) {
    return error as BootstrapPageError;
  }

  if (reason && reason in ERROR_BY_REASON) {
    return ERROR_BY_REASON[reason];
  }

  return 'db_error';
}

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    error?: string;
    reason?: string;
    redirect_url?: string;
  }>;
}) {
  const { state, error, reason, redirect_url } = await searchParams;

  if (state === 'org-required' || reason === 'org-required') {
    return <BootstrapOrgRequired redirectUrl={redirect_url} />;
  }

  return <BootstrapErrorUI error={resolveBootstrapError(error, reason)} />;
}
