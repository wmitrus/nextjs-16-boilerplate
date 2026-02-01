import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';
import { cn } from '@/shared/utils/cn';

const features = [
  {
    name: 'Next.js 16 Ready',
    description:
      'Leverage the latest App Router features, including Async Dynamic APIs and React 19 integration.',
    icon: '🚀',
  },
  {
    name: 'Tailwind CSS 4',
    description:
      'Built with the latest version of Tailwind for lightning-fast styling and modern design patterns.',
    icon: '🎨',
  },
  {
    name: 'Strict TypeScript',
    description:
      'Type safety out of the box with strict mode enabled and optimized configuration.',
    icon: '🛡️',
  },
  {
    name: 'Security First',
    description:
      'Pre-configured CSP, CSRF protection, and secure header management for production safety.',
    icon: '🔒',
  },
  {
    name: 'High Performance',
    description:
      'Optimized build process with Turbopack and smart caching strategies for maximum speed.',
    icon: '⚡',
  },
  {
    name: 'Clerk Ready',
    description:
      'Architected for seamless integration with Clerk for authentication and user management.',
    icon: '👤',
  },
];

const Features = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => {
  return (
    <PolymorphicElement
      as="section"
      ref={ref}
      id="features"
      className={cn('bg-white py-24 sm:py-32 dark:bg-black', className)}
      {...props}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base leading-7 font-semibold text-zinc-600 dark:text-zinc-400">
            Deploy faster
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-black sm:text-4xl dark:text-white">
            Everything you need to build your SaaS
          </p>
          <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Stop wasting time on configuration. Start building your product with
            a battle-tested architecture that scales with your needs.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base leading-7 font-semibold text-black dark:text-white">
                  <span
                    className="text-2xl"
                    role="img"
                    aria-label={feature.name}
                  >
                    {feature.icon}
                  </span>
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-zinc-600 dark:text-zinc-400">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </PolymorphicElement>
  );
});

Features.displayName = 'Features';

export { Features };
