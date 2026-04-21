'use client';

import { WorkspaceSwitcher } from '@/modules/auth/ui/WorkspaceSwitcher';

interface BootstrapOrgRequiredProps {
  redirectUrl?: string;
}

export function BootstrapOrgRequired({
  redirectUrl,
}: BootstrapOrgRequiredProps) {
  const continueUrl = redirectUrl
    ? `/auth/bootstrap/start?redirect_url=${encodeURIComponent(redirectUrl)}`
    : '/auth/bootstrap/start';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          Select or create a workspace
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          This application requires a workspace. Select an existing workspace or
          create a new one to continue.
        </p>
        <WorkspaceSwitcher
          hidePersonal
          createOrganizationMode="modal"
          afterSelectOrganizationUrl={continueUrl}
          afterCreateOrganizationUrl={continueUrl}
        />
      </div>
    </div>
  );
}
