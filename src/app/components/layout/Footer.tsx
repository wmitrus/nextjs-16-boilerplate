import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

import { CopyrightYear } from '@/app/components/layout/CopyrightYear';

const Footer = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return (
      <PolymorphicElement
        as="footer"
        ref={ref}
        className={cn(
          'border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950',
          className,
        )}
        {...props}
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-2">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/next.svg"
                  alt="Logo"
                  width={100}
                  height={20}
                  className="dark:invert"
                />
              </Link>
              <p className="mt-4 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
                A modern Next.js 16 boilerplate designed for performance,
                security, and developer experience.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-black dark:text-white">
                Product
              </h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="#features"
                    className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="#use-cases"
                    className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                  >
                    Use Cases
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-black dark:text-white">
                Company
              </h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/about"
                    className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog"
                    className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                  >
                    Blog
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-black dark:text-white">
                Legal
              </h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                  >
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                &copy; <CopyrightYear /> Next.js Boilerplate. All rights
                reserved.
              </p>
              <div className="flex items-center gap-4">
                <div
                  className="h-6 w-6 rounded-full bg-zinc-200 dark:bg-zinc-800"
                  aria-hidden="true"
                />
                <span className="text-xs text-zinc-500">v1.0.0</span>
              </div>
            </div>
          </div>
        </div>
      </PolymorphicElement>
    );
  },
);

Footer.displayName = 'Footer';

export { Footer };
