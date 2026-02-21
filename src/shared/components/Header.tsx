'use client';

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import { env } from '@/core/env';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const Header = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
      setIsMounted(true);
    }, []);

    return (
      <PolymorphicElement
        as="header"
        ref={ref}
        className={cn(
          'sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-black/80',
          className,
        )}
        {...props}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 transition-opacity hover:opacity-80"
            >
              <Image
                src="/next.svg"
                alt="Logo"
                width={100}
                height={20}
                className="dark:invert"
                priority
              />
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              <Link
                href="#features"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Features
              </Link>
              <Link
                href="#use-cases"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Use Cases
              </Link>
              <Link
                href="#pricing"
                className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Pricing
              </Link>
              <Link
                href="/security-showcase"
                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
              >
                Security Showcase
              </Link>
              <Link
                href="/env-summary"
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Env Summary
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
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
          </div>
        </div>
      </PolymorphicElement>
    );
  },
);

Header.displayName = 'Header';

export { Header };
