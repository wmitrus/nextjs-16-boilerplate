import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const Header = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
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
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-900"
              aria-hidden="true"
            />
            <Link
              href="/signup"
              className="inline-flex h-9 items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </PolymorphicElement>
    );
  },
);

Header.displayName = 'Header';

export { Header };
