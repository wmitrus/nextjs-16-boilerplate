import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { env } from '@/core/env';

import { ResendVerificationForm } from './verify-email-pending-client';

async function VerifyEmailPendingContent() {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Verify Your Email
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Your account requires email verification before sign-in.
          </p>
        </div>
        <div className="space-y-6">
          <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-950">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              If verification delivery is available, check your inbox for a
              verification link. If you did not receive one, you can request a
              new link below.
            </p>
          </div>
          <ResendVerificationForm />
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Already verified?{' '}
            <a
              href="/auth/signin"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPendingPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPendingContent />
    </Suspense>
  );
}
