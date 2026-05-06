import type { Metadata } from 'next';
import Link from 'next/link';

import { getSignInPath } from '@/shared/lib/routing/auth-entry';

export const metadata: Metadata = {
  title: 'Registration Closed',
  description: 'New account registration is currently closed.',
};

/**
 * Shown when REGISTRATION_MODE=disabled and a user attempts to sign up.
 */
export default function RegistrationClosedPage() {
  const signInPath = getSignInPath();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Registration Closed</h1>
      <p className="mt-4 max-w-md text-gray-600">
        New account registration is currently not available. If you already have
        an account, please sign in.
      </p>
      <Link
        href={signInPath}
        className="mt-6 rounded-md bg-black px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Sign In
      </Link>
    </main>
  );
}
