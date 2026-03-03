import { connection } from 'next/server';
import { Suspense } from 'react';

import { env } from '@/core/env';

export default async function SignUpPage() {
  await connection();

  if (env.AUTH_PROVIDER !== 'clerk') {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6 text-center text-zinc-600">
        Sign-up UI is not configured for AUTH_PROVIDER=
        {env.AUTH_PROVIDER}.
      </div>
    );
  }

  const { SignUp } = await import('@clerk/nextjs');

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense
        fallback={
          <div className="h-[600px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        }
      >
        <SignUp path="/sign-up" />
      </Suspense>
    </div>
  );
}
