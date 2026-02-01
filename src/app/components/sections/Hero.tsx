import Link from 'next/link';
import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const Hero = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return (
      <PolymorphicElement
        as="section"
        ref={ref}
        className={cn(
          'relative overflow-hidden bg-white py-24 sm:py-32 dark:bg-black',
          className,
        )}
        {...props}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-black sm:text-6xl dark:text-white">
              Build your next big idea{' '}
              <span className="text-zinc-500">faster than ever</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              The ultimate Next.js 16 boilerplate with React 19, Tailwind CSS 4,
              and high-performance architecture. Ready for production, secured
              by default.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/signup"
                className="rounded-full bg-black px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Get Started
              </Link>
              <Link
                href="#features"
                className="text-sm leading-6 font-semibold text-black dark:text-white"
              >
                Learn more <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="mt-16 flow-root sm:mt-24">
            <div className="relative -m-2 rounded-xl bg-zinc-900/5 p-2 ring-1 ring-zinc-900/10 ring-inset lg:-m-4 lg:rounded-2xl lg:p-4 dark:bg-white/5 dark:ring-white/10">
              <div
                className="aspect-[16/9] w-full rounded-md bg-zinc-100 dark:bg-zinc-900"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </PolymorphicElement>
    );
  },
);

Hero.displayName = 'Hero';

export { Hero };
