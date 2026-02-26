'use client';

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs';
import * as React from 'react';

import { env } from '@/core/env';

export function HeaderAuthControls() {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <React.Suspense
      fallback={
        <div className="h-9 w-20 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
      }
    >
      {isMounted && (
        <>
          <SignedOut>
            <SignInButton
              mode="modal"
              fallbackRedirectUrl={
                env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
              }
              signUpFallbackRedirectUrl={
                env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL
              }
              signUpForceRedirectUrl={
                env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL
              }
            >
              <button className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton
              mode="modal"
              forceRedirectUrl={
                env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL
              }
              signInFallbackRedirectUrl={
                env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
              }
              signInForceRedirectUrl={
                env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
              }
            >
              <button className="inline-flex h-9 items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
                Sign Up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </>
      )}
    </React.Suspense>
  );
}
