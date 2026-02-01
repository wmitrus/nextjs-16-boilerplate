import * as React from 'react';

import PolymorphicElement from '@/shared/components/ui/polymorphic-element';

const FEATURE_GROUPS = [
  {
    title: 'Modern Architecture & Performance',
    description:
      'Built on the cutting edge of the React ecosystem for maximum speed and efficiency.',
    features: [
      {
        name: 'Next.js 16 & React 19',
        description:
          'Leveraging Async Dynamic APIs, React Compiler, and the latest server components model.',
      },
      {
        name: 'Tailwind CSS 4',
        description:
          'Next-gen utility-first CSS with zero-runtime overhead and optimized performance.',
      },
      {
        name: 'Partial Prerendering (PPR)',
        description:
          'The best of static and dynamic combined, delivering instant loads with dynamic content.',
      },
      {
        name: 'Turbopack Optimized',
        description:
          'Blazing fast development cycles and optimized production builds with Next.js Turbopack.',
      },
    ],
  },
  {
    title: 'Type Safety & Developer Experience',
    description:
      'A developer-first environment designed for productivity, safety, and scalability.',
    features: [
      {
        name: 'Strict TypeScript',
        description:
          'Full type safety across the entire stack, ensuring code quality and reducing runtime errors.',
      },
      {
        name: 'Quality Tooling',
        description:
          'Pre-configured ESLint 9 (Flat Config), Prettier, and automated quality gates.',
      },
      {
        name: 'T3-Env Management',
        description:
          'Robust environment variable management with Zod validation for production reliability.',
      },
      {
        name: 'Standardized Workflow',
        description:
          'Conventional Commits, Husky hooks, and automated pre-push checks for team consistency.',
      },
    ],
  },
  {
    title: 'Enterprise-Grade Quality & Testing',
    description:
      'Comprehensive testing infrastructure and quality guards for mission-critical apps.',
    features: [
      {
        name: 'Three-Tier Testing',
        description:
          'Vitest for unit/integration tests and Playwright for robust E2E testing infrastructure.',
      },
      {
        name: 'Architecture Guards',
        description:
          'Automated circular dependency detection (Skott, Madge) and unused dependency checks.',
      },
      {
        name: 'Storybook Ready',
        description:
          'Component-driven development and visual regression testing with Storybook integration.',
      },
      {
        name: 'ESM Native',
        description:
          'A modern, fast module system used throughout the project for better performance.',
      },
    ],
  },
  {
    title: 'Production Resilience & Security',
    description:
      'Battle-tested patterns for secure, scalable, and observable production environments.',
    features: [
      {
        name: 'Security Suite',
        description:
          'Pre-configured Content Security Policy (CSP) and CSRF protection out of the box.',
      },
      {
        name: 'Advanced Error Handling',
        description:
          'Standardized API responses, global error boundaries, and correlation tracking.',
      },
      {
        name: 'Multi-Runtime Observability',
        description:
          'Structured logging with Pino and pre-configured Sentry/Logflare integration points.',
      },
      {
        name: 'Scalable Reliability',
        description:
          'Rate limiting patterns and production-ready infrastructure configurations.',
      },
    ],
  },
];

const FeaturesGrouped = () => {
  return (
    <PolymorphicElement
      as="section"
      id="features"
      className="bg-white py-24 sm:py-32"
    >
      <div className="max-auto mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base leading-7 font-semibold text-indigo-600">
            Enterprise Ready
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Everything you need to ship to production
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            A comprehensive suite of tools and patterns designed for
            high-performance, secure, and scalable applications.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-2">
            {FEATURE_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col">
                <dt className="text-xl leading-7 font-bold text-gray-900">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
                    <svg
                      className="h-6 w-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 22.5 12 13.5H3.75z"
                      />
                    </svg>
                  </div>
                  {group.title}
                </dt>
                <dd className="mt-1 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">{group.description}</p>
                  <ul className="mt-8 space-y-4 border-t border-gray-100 pt-8">
                    {group.features.map((feature) => (
                      <li key={feature.name} className="flex gap-x-3">
                        <svg
                          className="h-6 w-5 flex-none text-indigo-600"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>
                          <strong className="font-semibold text-gray-900">
                            {feature.name}.
                          </strong>{' '}
                          {feature.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </PolymorphicElement>
  );
};

export default FeaturesGrouped;
