import { Suspense } from 'react';

import { BootstrapErrorUI } from './bootstrap-error';
import { BootstrapOrgRequired } from './bootstrap-org-required';

const KNOWN_ERRORS = [
  'cross_provider_linking',
  'quota_exceeded',
  'tenant_config',
  'db_error',
] as const;

type BootstrapPageError = (typeof KNOWN_ERRORS)[number];
type BootstrapSearchParams = Promise<{
  state?: string;
  error?: string;
  reason?: string;
  redirect_url?: string;
}>;

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
    // eslint-disable-next-line security/detect-object-injection -- guarded by `in` check above; ERROR_BY_REASON has only static string keys
    return ERROR_BY_REASON[reason];
  }

  return 'db_error';
}

function BootstrapPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

export default function BootstrapPage({
  searchParams,
}: {
  searchParams: BootstrapSearchParams;
}) {
  return (
    <Suspense fallback={<BootstrapPageFallback />}>
      <BootstrapPageContent searchParams={searchParams} />
    </Suspense>
  );
}

export async function BootstrapPageContent({
  searchParams,
}: {
  searchParams: BootstrapSearchParams;
}) {
  const { state, error, reason, redirect_url } = await searchParams;

  if (state === 'org-required' || reason === 'org-required') {
    return <BootstrapOrgRequired redirectUrl={redirect_url} />;
  }

  return <BootstrapErrorUI error={resolveBootstrapError(error, reason)} />;
}
