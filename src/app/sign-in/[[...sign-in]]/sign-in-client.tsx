'use client';

import { SignIn } from '@clerk/nextjs';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export function SignInClient() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="h-[400px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
    );
  }

  return <SignIn path="/sign-in" />;
}
