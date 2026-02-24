import Link from 'next/link';
import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const CTA = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return (
      <PolymorphicElement
        as="section"
        ref={ref}
        className={cn(
          'relative isolate overflow-hidden bg-black py-24 sm:py-32 dark:bg-white',
          className,
        )}
        {...props}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl dark:text-black">
              Boost your productivity today.
              <br />
              Start using our boilerplate.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-zinc-300 dark:text-zinc-600">
              Join thousands of developers building faster, more secure, and
              highly performant applications with our Next.js 16 foundation.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/sign-up"
                className="rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-black shadow-sm hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white dark:bg-black dark:text-white dark:hover:bg-zinc-800"
              >
                Get Started
              </Link>
              <Link
                href="/docs"
                className="text-sm leading-6 font-semibold text-white dark:text-black"
              >
                View Documentation <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative background effects */}
        <div
          className="absolute -top-24 right-0 -z-10 transform-gpu blur-3xl"
          aria-hidden="true"
        >
          <div
            className="aspect-[1404/767] w-[87.75rem] bg-gradient-to-r from-zinc-500 to-zinc-800 opacity-20"
            style={{
              clipPath:
                'polygon(73.6% 51.7%, 91.7% 11.8%, 100% 46.4%, 97.4% 82.2%, 92.5% 84.9%, 75.7% 64%, 55.3% 47.5%, 46.5% 49.4%, 45% 62.9%, 50.3% 87.2%, 21.3% 64.1%, 0.1% 100%, 5.4% 51.1%, 21.4% 63.9%, 58.9% 0.2%, 73.6% 51.7%)',
            }}
          />
        </div>
      </PolymorphicElement>
    );
  },
);

CTA.displayName = 'CTA';

export { CTA };
