import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const StoryOne = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => {
  return (
    <PolymorphicElement
      as="section"
      ref={ref}
      className={cn(
        'overflow-hidden bg-zinc-50 py-24 sm:py-32 dark:bg-zinc-950',
        className,
      )}
      {...props}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:grid-cols-2 lg:items-start">
          <div className="px-6 lg:px-0 lg:pt-4 lg:pr-4">
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-lg">
              <h2 className="text-base leading-7 font-semibold text-zinc-600 dark:text-zinc-400">
                Deploy faster
              </h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-black sm:text-4xl dark:text-white">
                A better workflow for modern teams
              </p>
              <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
                Our boilerplate eliminates the repetitive setup work, allowing
                you to focus on building features that matter. From security to
                performance, we&apos;ve got you covered.
              </p>
              <dl className="mt-10 max-w-xl space-y-8 text-base leading-7 text-zinc-600 lg:max-w-none dark:text-zinc-400">
                <div className="relative pl-9">
                  <dt className="inline font-semibold text-black dark:text-white">
                    <div
                      className="absolute top-1 left-1 h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800"
                      aria-hidden="true"
                    />
                    Push to deploy.
                  </dt>
                  <dd className="ml-1 inline">
                    Automated CI/CD pipelines ensure your code is always
                    production-ready and deployed with a single push.
                  </dd>
                </div>
                <div className="relative pl-9">
                  <dt className="inline font-semibold text-black dark:text-white">
                    <div
                      className="absolute top-1 left-1 h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800"
                      aria-hidden="true"
                    />
                    SSL certificates.
                  </dt>
                  <dd className="ml-1 inline">
                    Automatic SSL certificate management and renewal to keep
                    your users&apos; data secure and your site trusted.
                  </dd>
                </div>
                <div className="relative pl-9">
                  <dt className="inline font-semibold text-black dark:text-white">
                    <div
                      className="absolute top-1 left-1 h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800"
                      aria-hidden="true"
                    />
                    Database backups.
                  </dt>
                  <dd className="ml-1 inline">
                    Daily automated backups with point-in-time recovery to
                    protect your most valuable asset: your data.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="sm:px-6 lg:px-0">
            <div className="relative isolate overflow-hidden bg-black px-6 pt-8 sm:mx-auto sm:max-w-2xl sm:rounded-3xl sm:pt-16 sm:pr-0 sm:pl-16 lg:mx-0 lg:max-w-none">
              <div
                className="absolute -inset-y-px -left-3 -z-10 w-full origin-bottom-left skew-x-[-30deg] bg-zinc-100 opacity-20 ring-1 ring-white ring-inset dark:bg-zinc-900"
                aria-hidden="true"
              />
              <div className="mx-auto max-w-2xl sm:mx-0 sm:max-w-none">
                <div className="w-[48rem] max-w-none rounded-xl bg-zinc-800 shadow-2xl ring-1 ring-white/10 dark:bg-zinc-900">
                  <div
                    className="aspect-[16/10] w-full bg-zinc-100 dark:bg-zinc-800"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div
                className="pointer-events-none absolute inset-0 ring-1 ring-black/10 ring-inset sm:rounded-3xl dark:ring-white/10"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </PolymorphicElement>
  );
});

StoryOne.displayName = 'StoryOne';

export { StoryOne };
