import React from 'react';

import { getEnvDiagnostics } from '@/features/security-showcase/lib/env-diagnostics';

export function EnvDiagnosticsExample() {
  const diagnostics = getEnvDiagnostics();

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold">Preview Env Diagnostics</h3>
      <p className="mb-4 text-sm text-gray-600">
        Server-side environment status for deployment-critical keys.
      </p>

      <p className="mb-3 text-sm">
        Status:{' '}
        <strong>{diagnostics.ok ? 'Healthy' : 'Missing Configuration'}</strong>
      </p>

      <ul className="mb-3 space-y-1 text-sm">
        {diagnostics.required.map((entry) => (
          <li key={entry.name}>
            {entry.name}:{' '}
            {entry.present ? `set (${entry.maskedValue})` : 'missing'}
          </li>
        ))}
      </ul>

      {diagnostics.pairIssues.length > 0 && (
        <ul className="mb-3 list-disc pl-5 text-sm text-gray-700">
          {diagnostics.pairIssues.map((issue) => (
            <li key={issue.pair.join(':')}>
              {issue.pair[0]} + {issue.pair[1]}: {issue.issue}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        Environment: {diagnostics.environment}
      </p>
    </div>
  );
}
