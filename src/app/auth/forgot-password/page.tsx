import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Suspense } from 'react';

import { env } from '@/core/env';

import { ForgotPasswordClient } from './forgot-password-client';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';

async function ForgotPasswordPageContent() {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    redirect('/');
  }

  const session = await getServerSession(authOptions);
  if (session) {
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Forgot Password
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter your email and we&#39;ll send you a reset link.
          </p>
        </div>
        <ForgotPasswordClient />
        <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Remember your password?{' '}
          <a
            href="/auth/signin"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
