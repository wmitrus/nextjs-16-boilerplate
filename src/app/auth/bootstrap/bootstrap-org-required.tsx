'use client';

import { OrganizationSwitcher } from '@clerk/nextjs';

export function BootstrapOrgRequired() {
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
        <OrganizationSwitcher
          hidePersonal
          createOrganizationMode="modal"
          afterSelectOrganizationUrl="/auth/bootstrap"
          afterCreateOrganizationUrl="/auth/bootstrap"
        />
      </div>
    </div>
  );
}
