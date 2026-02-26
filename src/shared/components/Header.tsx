'use client';

import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  rightContent?: React.ReactNode;
}

const Header = React.forwardRef<HTMLElement, HeaderProps>(
  ({ className, rightContent, ...props }, ref) => {
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
          <div className="flex items-center gap-4">{rightContent}</div>
        </div>
      </PolymorphicElement>
    );
  },
);

Header.displayName = 'Header';

export { Header };
