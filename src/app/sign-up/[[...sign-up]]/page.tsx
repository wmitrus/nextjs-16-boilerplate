import { connection } from 'next/server';
import { Suspense } from 'react';

import { env } from '@/core/env';

import { SignUpClient } from './sign-up-client';

export async function SignUpPageContent() {
  await connection();

  if (env.AUTH_PROVIDER !== 'clerk') {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6 text-center text-zinc-600">
        Sign-up UI is not configured for AUTH_PROVIDER=
        {env.AUTH_PROVIDER}.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUpClient />
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageContent />
    </Suspense>
  );
}
