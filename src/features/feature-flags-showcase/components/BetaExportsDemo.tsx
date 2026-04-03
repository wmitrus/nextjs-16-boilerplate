import React from 'react';

interface BetaExportsDemoProps {
  enabled: boolean;
}

export function BetaExportsDemo({ enabled }: BetaExportsDemoProps) {
  if (enabled) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800/50 dark:bg-emerald-950/30">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600">
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
                Beta Exports
              </h3>
              <span className="inline-flex items-center rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300">
                Beta
              </span>
            </div>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
              Export feature is <strong>enabled</strong> via flag{' '}
              <code className="font-mono font-medium">demo.beta-exports</code>.
              This simulates a beta feature exposed only to opted-in tenants
              before general availability.
            </p>
            <div className="mt-4 flex gap-2">
              {['CSV', 'JSON', 'PDF'].map((format) => (
                <span
                  key={format}
                  className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  {format}
                </span>
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
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-600 dark:text-zinc-400">
              Beta Exports
            </h3>
            <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
              Coming Soon
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
            Export is not yet enabled. Set{' '}
            <code className="font-mono font-medium">
              demo.beta-exports=true
            </code>{' '}
            in <code className="font-mono">FEATURE_FLAGS_STATIC</code> to
            activate the beta export feature.
          </p>
        </div>
      </div>
    </div>
  );
}
