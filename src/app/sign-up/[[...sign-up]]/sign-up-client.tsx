'use client';

import { SignUp } from '@clerk/nextjs';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export function SignUpClient() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="h-[600px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
    );
  }

  return <SignUp path="/sign-up" />;
}
