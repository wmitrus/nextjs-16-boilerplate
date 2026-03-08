'use client';

import dynamic from 'next/dynamic';

const SignIn = dynamic(() => import('@clerk/nextjs').then((m) => m.SignIn), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
  ),
});

export function SignInClient() {
  return <SignIn path="/sign-in" />;
}
