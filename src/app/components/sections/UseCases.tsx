import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const useCases = [
  {
    title: 'SaaS Platforms',
    description:
      'Perfect for multi-tenant applications with complex state management and secure authentication requirements.',
  },
  {
    title: 'Enterprise Dashboards',
    description:
      'Build high-performance internal tools with real-time data updates and strict security standards.',
  },
  {
    title: 'E-commerce Solutions',
    description:
      'Scale your online store with lightning-fast page loads and optimized product catalogs.',
  },
  {
    title: 'Marketing Sites',
    description:
      'Deliver pixel-perfect, SEO-optimized landing pages that convert visitors into customers.',
  },
];

const UseCases = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => {
  return (
    <PolymorphicElement
      as="section"
      ref={ref}
      id="use-cases"
      className={cn('bg-zinc-50 py-24 sm:py-32 dark:bg-zinc-950', className)}
      {...props}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base leading-7 font-semibold text-zinc-600 dark:text-zinc-400">
            Versatility
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-black sm:text-4xl dark:text-white">
            Built for every use case
          </p>
          <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Whether you&apos;re building a simple blog or a complex enterprise
            application, our boilerplate provides the foundation you need.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((useCase) => (
              <div
                key={useCase.title}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-8 transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-black"
              >
                <div>
                  <h3 className="text-lg leading-8 font-semibold tracking-tight text-black dark:text-white">
                    {useCase.title}
                  </h3>
                  <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-400">
                    {useCase.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PolymorphicElement>
  );
});

UseCases.displayName = 'UseCases';

export { UseCases };
