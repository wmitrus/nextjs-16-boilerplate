'use client';

import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

const ERROR_MESSAGES: Record<
  'cross_provider_linking' | 'quota_exceeded' | 'tenant_config',
  string
> = {
  cross_provider_linking:
    'This account is linked to a different sign-in method. Please sign in with your original provider or contact support.',
  quota_exceeded:
    'This workspace has reached its user limit. Please contact your workspace administrator to upgrade the plan.',
  tenant_config:
    'Workspace configuration is incomplete or missing. Please contact your administrator.',
};

interface BootstrapErrorUIProps {
  error: 'cross_provider_linking' | 'quota_exceeded' | 'tenant_config';
}

export function BootstrapErrorUI({ error }: BootstrapErrorUIProps) {
  const { signOut } = useClerk();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/sign-in');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          Sign-in could not be completed
        </h1>
        <p className="mb-6 text-sm text-gray-600">{ERROR_MESSAGES[error]}</p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Try Again
          </button>
          <button
            onClick={handleSignOut}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
