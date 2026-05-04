import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Suspense } from 'react';

import { env } from '@/core/env';

import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

import { buildBootstrapRedirectUrl } from '../post-auth-redirect';

import { SignInClient } from './sign-in-client';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';

async function SignInPageContent({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    redirect_url?: string;
    error?: string;
    verified?: string;
  }>;
}) {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    redirect('/');
  }

  const session = await getServerSession(authOptions);
  const { callbackUrl, redirect_url, error, verified } = await searchParams;
  const safeRedirect = sanitizeRedirectUrl(
    callbackUrl ?? redirect_url ?? '',
    '/dashboard',
  );

  if (session) {
    redirect(buildBootstrapRedirectUrl(safeRedirect));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Sign In
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter your credentials to continue
          </p>
        </div>
        <SignInClient
          callbackUrl={safeRedirect}
          error={error}
          verified={verified === 'true'}
        />
        <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          {"Don't have an account? "}
          <a
            href="/auth/signup"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Sign up
          </a>
        </p>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          <a
            href="/auth/forgot-password"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Forgot password?
          </a>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    redirect_url?: string;
    error?: string;
    verified?: string;
  }>;
}) {
  return (
    <Suspense fallback={null}>
      <SignInPageContent searchParams={searchParams} />
    </Suspense>
  );
}
