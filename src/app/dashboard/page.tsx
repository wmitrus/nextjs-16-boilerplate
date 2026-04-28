import Link from 'next/link';

import { DashboardToolsTable } from './DashboardToolsTable';
import { getDashboardToolInventory } from './tools-inventory';

const sections = [
  {
    href: '/admin',
    title: 'Administration',
    description:
      'Platform administration, invites, and user management. Admin access required.',
    badge: 'restricted',
  },
  {
    href: '/feature-flags-demo',
    title: 'Feature Flags Demo',
    description:
      'Inspect the integrated feature-flag system and demo toggles in a live route.',
    badge: 'demo',
  },
  {
    href: '/security-showcase',
    title: 'Security Showcase',
    description:
      'Review security-focused pages and middleware-driven protection examples.',
    badge: 'reference',
  },
  {
    href: '/env-summary',
    title: 'Environment Summary',
    description:
      'Check runtime wiring and environment-driven integration state in one place.',
    badge: 'ops',
  },
] as const;

export default function DashboardPage() {
  const tools = getDashboardToolInventory();
  const activeTools = tools.filter(
    (tool) => tool.statusTone === 'active',
  ).length;
  const configuredTools = tools.filter(
    (tool) => tool.statusTone === 'configured',
  ).length;
  const ciAndLocalTools = tools.filter(
    (tool) => tool.statusTone === 'ci' || tool.statusTone === 'local',
  ).length;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 sm:px-6 lg:px-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.4fr_0.8fr] lg:px-10 lg:py-10">
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-[0.24em] text-emerald-600 uppercase dark:text-emerald-400">
                Authenticated Workspace
              </p>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
                  Boilerplate control center
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base dark:text-zinc-300">
                  This is the default signed-in landing route for the
                  boilerplate. It gives users one stable place to continue into
                  the integrated modules without dropping them straight into a
                  feature-specific screen.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-950/60">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Recommended first stops
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
                <li>Review feature flag integrations and runtime behavior.</li>
                <li>Open security and observability reference routes.</li>
                <li>
                  Use administration tools when your account has elevated
                  access.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors transition-transform hover:-translate-y-0.5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {section.title}
                </h2>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300">
                  {section.badge}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {section.description}
              </p>
              <p className="mt-5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Open section
              </p>
            </Link>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-8 px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <p className="text-xs font-semibold tracking-[0.24em] text-sky-600 uppercase dark:text-sky-400">
                  Runtime Inventory
                </p>
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
                    Integrated tool inventory
                  </h2>
                  <p className="text-sm leading-6 text-zinc-600 sm:text-base dark:text-zinc-300">
                    This catalog turns repository research into one operational
                    view. It groups runtime services, CI-only platforms, and
                    local workflow systems so you can see what is active in the
                    current app profile, what is merely available, and where
                    each tool is managed.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[27rem]">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400">
                    Active now
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {activeTools}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400">
                    Configured
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {configuredTools}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400">
                    CI or local
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {ciAndLocalTools}
                  </p>
                </div>
              </div>
            </div>

            <DashboardToolsTable tools={tools} />
          </div>
        </section>
      </div>
    </main>
  );
}
