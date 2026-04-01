import React from 'react';

interface ExperimentalAnalyticsDemoProps {
  enabled: boolean;
}

export function ExperimentalAnalyticsDemo({
  enabled,
}: ExperimentalAnalyticsDemoProps) {
  if (enabled) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-6 dark:border-violet-800/50 dark:bg-violet-950/30">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-violet-600">
            <svg
              className="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-violet-900 dark:text-violet-200">
                Experimental Analytics
              </h3>
              <span className="inline-flex items-center rounded-full bg-violet-200 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-800/40 dark:text-violet-300">
                Experimental
              </span>
            </div>
            <p className="mt-1 text-sm text-violet-700 dark:text-violet-300">
              Analytics widget is <strong>enabled</strong> via flag{' '}
              <code className="font-mono font-medium">
                demo.experimental-analytics
              </code>
              . This widget is in evaluation — not yet stable for all tenants.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Page Views', value: '12,483' },
                { label: 'Conversions', value: '3.2%' },
                { label: 'Avg. Session', value: '4m 12s' },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-violet-100 bg-white p-3 dark:border-violet-700/40 dark:bg-violet-900/20"
                >
                  <p className="text-xs text-violet-600 dark:text-violet-400">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-violet-900 dark:text-violet-200">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-300 dark:bg-zinc-700">
          <svg
            className="h-5 w-5 text-zinc-500 dark:text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-zinc-600 dark:text-zinc-400">
            Experimental Analytics
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
            Analytics widget is not yet enabled. Set{' '}
            <code className="font-mono font-medium">
              demo.experimental-analytics=true
            </code>{' '}
            in <code className="font-mono">FEATURE_FLAGS_STATIC</code> to
            activate it.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {['—', '—', '—'].map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="mt-2 h-5 w-10 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
