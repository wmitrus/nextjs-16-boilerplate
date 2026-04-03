import React from 'react';

interface FeatureFlagStatusCardProps {
  flagName: string;
  enabled: boolean;
  provider: string;
}

export function FeatureFlagStatusCard({
  flagName,
  enabled,
  provider,
}: FeatureFlagStatusCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1">
        <code className="font-mono text-sm text-zinc-800 dark:text-zinc-200">
          {flagName}
        </code>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          provider: {provider}
        </span>
      </div>
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          enabled
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
        }`}
      >
        {enabled ? 'enabled' : 'disabled'}
      </span>
    </div>
  );
}
