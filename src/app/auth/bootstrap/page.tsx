import { BootstrapErrorUI } from './bootstrap-error';
import { BootstrapOrgRequired } from './bootstrap-org-required';

const KNOWN_ERRORS = new Set([
  'cross_provider_linking',
  'quota_exceeded',
  'tenant_config',
  'db_error',
]);

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    error?: string;
    redirect_url?: string;
  }>;
}) {
  const { state, error, redirect_url } = await searchParams;

  if (state === 'org-required') {
    return <BootstrapOrgRequired redirectUrl={redirect_url} />;
  }

  const safeError =
    error && KNOWN_ERRORS.has(error)
      ? (error as
          | 'cross_provider_linking'
          | 'quota_exceeded'
          | 'tenant_config'
          | 'db_error')
      : 'db_error';

  return <BootstrapErrorUI error={safeError} />;
}
