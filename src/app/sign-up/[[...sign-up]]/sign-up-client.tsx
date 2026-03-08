'use client';

import dynamic from 'next/dynamic';

const SignUp = dynamic(() => import('@clerk/nextjs').then((m) => m.SignUp), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
  ),
});

export function SignUpClient() {
  return <SignUp path="/sign-up" />;
}
