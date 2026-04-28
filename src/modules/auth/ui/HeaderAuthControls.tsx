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

import { normalizeClerkPostAuthRedirect } from '@/modules/auth/lib/clerk-redirects';

export function HeaderAuthControls() {
  const [isMounted, setIsMounted] = React.useState(false);
  const signInForceRedirectUrl = normalizeClerkPostAuthRedirect(
    env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL,
    env.NEXT_PUBLIC_APP_URL,
  );
  const signInFallbackRedirectUrl = normalizeClerkPostAuthRedirect(
    env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    env.NEXT_PUBLIC_APP_URL,
  );
  const signUpFallbackRedirectUrl = normalizeClerkPostAuthRedirect(
    env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
    env.NEXT_PUBLIC_APP_URL,
  );
  const signUpForceRedirectUrl = normalizeClerkPostAuthRedirect(
    env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL,
    env.NEXT_PUBLIC_APP_URL,
  );

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
              // Keep modal flows aligned with provider-level stable post-auth
              // landing. Server guards decide whether bootstrap is needed.
              // Normalize post-auth targets to absolute same-origin URLs.
              forceRedirectUrl={signInForceRedirectUrl}
              fallbackRedirectUrl={signInFallbackRedirectUrl}
              signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
              signUpForceRedirectUrl={signUpForceRedirectUrl}
            >
              <button className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton
              mode="modal"
              forceRedirectUrl={signUpForceRedirectUrl}
              signInFallbackRedirectUrl={signInFallbackRedirectUrl}
              signInForceRedirectUrl={signInForceRedirectUrl}
            >
              <button className="inline-flex h-9 items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
                Sign Up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <div className="flex items-center gap-3">
              <a
                href="/admin"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Administration
              </a>
              <UserButton />
            </div>
          </SignedIn>
        </>
      )}
    </React.Suspense>
  );
}
