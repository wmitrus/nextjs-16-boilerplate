import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { FEATURE_FLAGS } from '@/core/contracts';
import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { BetaExportsDemo } from '@/features/feature-flags-showcase/components/BetaExportsDemo';
import { ExperimentalAnalyticsDemo } from '@/features/feature-flags-showcase/components/ExperimentalAnalyticsDemo';
import { FeatureFlagStatusCard } from '@/features/feature-flags-showcase/components/FeatureFlagStatusCard';
import { NewDashboardUiDemo } from '@/features/feature-flags-showcase/components/NewDashboardUiDemo';

export const metadata: Metadata = {
  title: 'Feature Flags Demo | Next.js 16 Boilerplate',
  description:
    'Live demonstration of the multi-adapter feature flag system. Switch providers via env var, evaluate flags server-side, and control UI rollout.',
};

export default function FeatureFlagsDemoPage() {
  return (
    <Suspense fallback={null}>
      <FeatureFlagsDemoContent />
    </Suspense>
  );
}

async function FeatureFlagsDemoContent() {
  // connection() opts this route into dynamic rendering.
  // Required before calling getAppContainer() because the DI infrastructure
  // initializer uses Pino which calls Date.now() — triggering Next.js 16
  // prerender errors unless a dynamic data source is accessed first.
  await connection();

  const requestContainer = getAppContainer().createChild();
  const flagService = requestContainer.resolve<FeatureFlagService>(
    FEATURE_FLAGS.SERVICE,
  );

  const provider = env.FEATURE_FLAG_PROVIDER;

  // Demo-only synthetic context — carries no security significance.
  // The static adapter ignores context; DB/GrowthBook return false for unknown ids.
  const demoAuthContext: AuthorizationContext = {
    tenant: { tenantId: 'demo' },
    subject: { id: 'anonymous' },
    resource: { type: 'demo' },
    action: 'demo:view',
  };

  const [newDashboardUi, betaExports, experimentalAnalytics] =
    await Promise.all([
      flagService.isEnabled('demo.new-dashboard-ui', demoAuthContext),
      flagService.isEnabled('demo.beta-exports', demoAuthContext),
      flagService.isEnabled('demo.experimental-analytics', demoAuthContext),
    ]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <header className="mb-12">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-black dark:text-white">
          Feature Flags Showcase
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          A live demonstration of the multi-adapter feature flag system.
          Evaluation happens <strong>server-side</strong> via the{' '}
          <code className="font-mono text-sm">FeatureFlagService</code> contract
          — no vendor SDK exposed to the app layer.
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          Flags evaluated using an anonymous demo context. Toggle flags by
          editing{' '}
          <code className="font-mono font-medium">FEATURE_FLAGS_STATIC</code> in
          your <code className="font-mono">.env.local</code>.
        </p>
      </header>

      <div className="grid gap-10">
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-black dark:text-white">
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Status
            </span>
            Active Flags
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Flags resolved server-side from the <strong>{provider}</strong>{' '}
            adapter.
          </p>
          <div className="flex flex-col gap-2">
            <FeatureFlagStatusCard
              flagName="demo.new-dashboard-ui"
              enabled={newDashboardUi}
              provider={provider}
            />
            <FeatureFlagStatusCard
              flagName="demo.beta-exports"
              enabled={betaExports}
              provider={provider}
            />
            <FeatureFlagStatusCard
              flagName="demo.experimental-analytics"
              enabled={experimentalAnalytics}
              provider={provider}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-black dark:text-white">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-sm font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              UI Gate
            </span>
            Dashboard Design
          </h2>
          <NewDashboardUiDemo enabled={newDashboardUi} />
        </section>

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-black dark:text-white">
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Beta
            </span>
            Export Feature
          </h2>
          <BetaExportsDemo enabled={betaExports} />
        </section>

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-black dark:text-white">
            <span className="rounded bg-violet-100 px-2 py-0.5 text-sm font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              Experimental
            </span>
            Analytics Widget
          </h2>
          <ExperimentalAnalyticsDemo enabled={experimentalAnalytics} />
        </section>

        <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-black dark:text-white">
            How to switch adapters
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
            <ol className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                  1
                </span>
                <span>
                  <strong>Static</strong> (default) — set{' '}
                  <code className="font-mono">
                    FEATURE_FLAG_PROVIDER=static
                  </code>{' '}
                  and configure{' '}
                  <code className="font-mono">
                    FEATURE_FLAGS_STATIC=demo.new-dashboard-ui=true,demo.beta-exports=false,demo.experimental-analytics=true
                  </code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                  2
                </span>
                <span>
                  <strong>Database</strong> — set{' '}
                  <code className="font-mono">FEATURE_FLAG_PROVIDER=db</code>,
                  run migrations, then use{' '}
                  <code className="font-mono">
                    pnpm flags:migrate --from=static --to=db
                  </code>{' '}
                  to seed your flags.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                  3
                </span>
                <span>
                  <strong>GrowthBook</strong> — set{' '}
                  <code className="font-mono">
                    FEATURE_FLAG_PROVIDER=growthbook
                  </code>{' '}
                  and provide{' '}
                  <code className="font-mono">GROWTHBOOK_CLIENT_KEY</code>.
                </span>
              </li>
            </ol>
          </div>
        </section>

        <footer className="border-t border-zinc-200 pt-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
          <p>
            Feature Flags Architecture &bull; Built with Next.js 16 &bull;
            Server-side evaluation only
          </p>
        </footer>
      </div>
    </div>
  );
}
