import { connection } from 'next/server';

import { env } from '@/core/env';

import { SignInClient } from './sign-in-client';

export default async function Page() {
  await connection();

  if (env.AUTH_PROVIDER !== 'clerk') {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6 text-center text-zinc-600">
        Sign-in UI is not configured for AUTH_PROVIDER=
        {env.AUTH_PROVIDER}.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignInClient />
    </div>
  );
}
